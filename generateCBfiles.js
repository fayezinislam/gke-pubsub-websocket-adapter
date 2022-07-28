#!/usr/bin/env node

// Copyright 2022 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//Creates a websocket API client
import WebSocket from "websocket";
var WebSocketClient = WebSocket.client;
var wsReconnectInterval = 1000 * 1;

import * as fs from 'fs'

// [0]=ws-url [1]=topic-prefix [2]=debug
// command line arguments
const clArgs = process.argv.slice(2);
console.log(clArgs);

var folderPath = "./cloudbuild_mktpairs/";
var wsUrl;
var topicPrefix;
// flag to output message
var outputMessages = false;
var project;
var zone;
var marketPairLimit;
var clusterName;
var podNamePrefix;

// node ./generateCBfiles.js "ftx-com-streaming-demo" "asia-northeast1-b" "ftx-com-mktpair-cluster" "ftx-com" "wss://ftx.us/ws/" "projects/$PROJECT_NAME/topics/ftx_us_" 5 true
if(clArgs.length != 7) {
    console.error("Incorrect number of arguments. \nUsage: node ./generateCBfiles.js {project} {zone} {cluster-name} {pod-name-prefix} {ws-url} {topic-prefix} {market-pair-limit} {debug}");
} else {

    project = clArgs[0];
    zone = clArgs[1];
    clusterName = clArgs[2];
    podNamePrefix = clArgs[3];
    wsUrl = clArgs[4];
    topicPrefix = clArgs[5];
    marketPairLimit = clArgs[6];
    if(clArgs[7] === "true") {
        outputMessages = true;
    }
}


var client;

var connect = async function() { 

    client = new WebSocketClient();
    client.connect(wsUrl, null);

    //On connection failure log error to console
    client.on('connectFailed', function(error) {
        console.log('Connect Error: ' + error.toString());
    });

    //Define actions for successful connection
    client.on('connect', function(connection) {
        console.log('WebSocket Client Connected');
        connection.on('error', function(error) {
            console.log("Connection Error: " + error.toString());
            //setTimeout(connect, wsReconnectInterval);
        });
        connection.on('close', function() {
	    console.log('Connection closed');
            // subscriptions have been lost, so reset subscriptions
            //setTimeout(connect, wsReconnectInterval);
        });
        connection.on('message', function(message) {
            if (message.type === 'utf8') {
                //Parse JSON message & add receive timestamp
                var data = JSON.parse(message.utf8Data);
                data.time_ws = getTimestamp();

                // Checks market list data
                if (data.channel === 'markets') {
                    logMessage("Markets \n" + new Date().toISOString() + "\n" + JSON.stringify(data));
                    checkMarketList(data);
                }

                //Print message in console
                //logMessage("Received: '" + JSON.stringify(data) + "'");
            }
        });
        
        // an updated set of market list will be sent every 60sec
        function subscribeToMarketList() {
            if (connection.connected) {
               
                connection.send(JSON.stringify({
                    'op': 'subscribe',
                    'channel': 'markets'
                }));

            }
        }

        // Parses through market list
        // Generates 3 cloud build files for each marketpair
        async function checkMarketList(marketListData) {

            // null check
            if(marketListData == null || marketListData.data == null || marketListData.data.data == null) 
                return;

            var marketPairCounter = 0;
            for (const marketKey in marketListData.data.data) {
                console.log("Checking " + marketKey);
                    
                    // Gets market pairs up to marketPairLimit parameter
                    if(marketPairLimit > 0 && marketPairCounter < marketPairLimit) {
                        console.log("Generating file for " + marketKey);
                        //await sleep(1000);
                        launchExternalProcess(marketKey);
			marketPairCounter++;
                    } else if(marketPairCounter <= 0) {
                        // no limit
                        console.log("Generating file for " + marketKey);
                        //await sleep(1000);
                        launchExternalProcess(marketKey);
			marketPairCounter++;
                    }
                    
            }
            console.log("Files created for " + marketPairCounter + " market pairs");
	    process.exit(); 
        }

        subscribeToMarketList();
        
    });
};

//Connect to FTX US websocket server
connect();

// execute external process
function launchExternalProcess(marketPair) {

    writeCBFile(marketPair, "ticker");
    writeCBFile(marketPair, "trades");
    writeCBFile(marketPair, "orderbook");

    outputCBBuilds(marketPair, "ticker");
    outputCBBuilds(marketPair, "trades");
    outputCBBuilds(marketPair, "orderbook")

    outputCBCalls(marketPair, "ticker");
    outputCBCalls(marketPair, "trades");
    outputCBCalls(marketPair, "orderbook");

    outputIngressPaths(marketPair, "ticker");
    outputIngressPaths(marketPair, "trades");
    outputIngressPaths(marketPair, "orderbook");

}

function writeCBFile(marketPair, type) {

  var marketPairStrD = marketPair.replaceAll('/','-').toLowerCase();
  var marketPairStrU = marketPair.replaceAll('/','_').toLowerCase();
  marketPairStrU = marketPairStrU.replaceAll('-','_').toLowerCase();
  var podNamePrefixU = podNamePrefix.replaceAll('-','_').toLowerCase();

  console.log("Creating cloud build file for " + marketPairStrU + " " + type);
  var appNameD = podNamePrefix + type + "-" + marketPairStrD;
  var appNameU = podNamePrefixU + type + "_" + marketPairStrU;
  var fileNamePrefix = "./cloudbuild_" + type + "_";

const cbTemplate = `timeout: 10800s
substitutions:
  _DYSON_APP_NAME: "${appNameD}"
  _DYSON_TOPIC: "projects/${project}/topics/${appNameU}"
steps:
  # [Set project Id throughout the repo]
- name: gcr.io/kpt-dev/kpt:latest
  id: "Set Project ID"
  args: ['cfg', 'set', '.', 'PROJECT_ID', '\${PROJECT_ID}']

  # [Set the Pub/Sub topic to use
- name: gcr.io/kpt-dev/kpt:latest
  id: "Set Pub/Sub Topic"
  args: ['cfg', 'set', '.', 'TOPIC', '\${_DYSON_TOPIC}']

  # [Set the name of the app to be deployed into GKE]
- name: gcr.io/kpt-dev/kpt:latest
  id: "Set App Name"
  args: ['cfg', 'set', '.', 'APP_NAME', '\${_DYSON_APP_NAME}']

- name: gcr.io/kpt-dev/kpt:latest
  id: "Set ConfigMap Name"
  args: ['cfg', 'set', '.', 'TOPIC_CONFIG', 'config-\${_DYSON_APP_NAME}']

  # [Deploy dyson manifests to GKE]
  # hardcode cluster name bc we want to deploy to the same cluster
  # Don't need to wait for deploy-cluster, removing it
- name: 'gcr.io/cloud-builders/kubectl'
  args: ['apply', '-f', './kubernetes_mktpair/']
  env:
  - 'CLOUDSDK_COMPUTE_ZONE=${zone}'
  - 'CLOUDSDK_CONTAINER_CLUSTER=${clusterName}'`;

    fs.writeFileSync(folderPath + fileNamePrefix + marketPairStrU + ".yaml", cbTemplate, err => {
      if (err) {
        console.error(err);
      }
      // file written successfully
    });

    
}

function outputCBBuilds(marketPair, type) {

  var marketPairStrD = marketPair.replaceAll('/','-').toLowerCase();
  var marketPairStrU = marketPair.replaceAll('/','_').toLowerCase();
  marketPairStrU = marketPairStrU.replaceAll('-','_').toLowerCase();
  var podNamePrefixU = podNamePrefix.replaceAll('-','_').toLowerCase();

  var appNameD = podNamePrefix + type + "-" + marketPairStrD;
  var appNameU = podNamePrefixU + type + "_" + marketPairStrU;
  var fileName = "cloudbuild_mktpairs/cloudbuild_" + type + "_" + marketPairStrU + ".yaml";

  const cbCall = `gcloud builds submit --config ${fileName}` + "\n";
  console.log(cbCall);

  fs.writeFileSync(folderPath + "cbCommands.sh", cbCall, {'flag':'a'}, err => {
      if (err) {
        console.error(err);
      }
      // file written successfully
    });

}

function outputCBCalls(marketPair, type) {

  var marketPairStrD = marketPair.replaceAll('/','-').toLowerCase();
  var marketPairStrU = marketPair.replaceAll('/','_').toLowerCase();
  marketPairStrU = marketPairStrU.replaceAll('-','_').toLowerCase();
  var podNamePrefixU = podNamePrefix.replaceAll('-','_').toLowerCase();

  var appNameD = podNamePrefix + type + "-" + marketPairStrD;
  var appNameU = podNamePrefixU + type + "_" + marketPairStrU;
  var fileName = "cloudbuild_mktpairs/cloudbuild_" + type + "_" + marketPairStrU + ".yaml";

  const cbCall = `- name: 'gcr.io/cloud-builders/gcloud'
  args: ['builds', 'submit', '--config=${fileName}']
  waitFor: ['push-image', 'deploy-cluster']` + "\n";
  console.log(cbCall);

  fs.writeFileSync(folderPath + "cbCalls.cfg", cbCall, {'flag':'a'}, err => {
      if (err) {
        console.error(err);
      }
      // file written successfully
    });

}

function outputIngressPaths(marketPair, type) { 

  var marketPairStrD = marketPair.replaceAll('/','-').toLowerCase();
  var marketPairStrU = marketPair.replaceAll('/','_').toLowerCase();
  marketPairStrU = marketPairStrU.replaceAll('-','_').toLowerCase();
  var podNamePrefixU = podNamePrefix.replaceAll('-','_').toLowerCase();

  var appNameD = podNamePrefix + type + "-" + marketPairStrD;
  var appNameU = podNamePrefixU + type + "_" + marketPairStrU;

  const ingressPre = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ftx-websocket-ingress
  annotations:
    kubernetes.io/ingress.global-static-ip-name: ftx-gcpfsi-ip
    networking.gke.io/managed-certificates: ftx-gcpfsi-com-cert
    networking.gke.io/v1beta1.FrontendConfig: ftx-websocket-ingress-fc
    kubernetes.io/ingress.class: gce
spec:
  rules:
  - http:
      paths:
      - path: /*
        pathType: ImplementationSpecific
        backend:
          service:
            name: ${podNamePrefix}ticker-btc-usd-service
            port:
              number: 80` + "\n";

  const ingressPaths = `      - path: /${type}-${marketPairStrD}
        pathType: ImplementationSpecific
        backend:
          service:
            name: ${appNameD}-service
            port:
              number: 80` + "\n";

  const ingressPost = `---
apiVersion: networking.gke.io/v1
kind: ManagedCertificate
metadata:
  name: ftx-gcpfsi-com-cert
spec:
  domains:
    - ftx.gcpfsi.com # {"$kpt-set":"dns"} 
---
apiVersion: networking.gke.io/v1beta1
kind: FrontendConfig
metadata:
  name: ftx-websocket-ingress-fc
spec:
  redirectToHttps:
    enabled: true
    responseCodeName: "301"` + "\n";

  fs.writeFileSync(folderPath + "ingressPaths.yaml", ingressPre + ingressPaths + ingressPost, {'flag':'a'}, err => {
      if (err) {
        console.error(err);
      }
      // file written successfully
    });
}

//Function to get current timestamp in UTC
function getTimestamp() {
    var date = new Date();
    var result = 
        date.getUTCFullYear()+"-"
        +pad(date.getUTCMonth()+1)+"-"
        +pad(date.getUTCDate())+" "
        +pad(date.getUTCHours())+":"
        +pad(date.getUTCMinutes())+":"
        +pad(date.getUTCSeconds())+"."
        +date.getUTCMilliseconds()+"000+00:00";
    return result;
  }

//Function to pad timestamp single digits with zero for data formatting
function pad(n){return n<10 ? '0'+n : n}

function logMessage(message) {
    if(outputMessages) {
        console.log(message);
    }
}

function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}



