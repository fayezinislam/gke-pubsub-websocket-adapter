#!/bin/bash
if [ $# -eq 0 ] | [ -z "$1" ]
  then
    echo "No arguments supplied, please supply a hostname."
    echo "example: ./deploy.sh example.com"
    exit 1
fi
export PROJECT_ID=$(gcloud config get-value project)
gcloud services enable --project ${PROJECT_ID?} \
    cloudresourcemanager.googleapis.com \
    compute.googleapis.com \
    container.googleapis.com \
    cloudbuild.googleapis.com \
    stackdriver.googleapis.com
CLOUDBUILD_SA=$(gcloud projects describe ${PROJECT_ID?} --format='value(projectNumber)')@cloudbuild.gserviceaccount.com 
gcloud projects add-iam-policy-binding ${PROJECT_ID?} --member serviceAccount:${CLOUDBUILD_SA?} --role roles/owner
gcloud projects add-iam-policy-binding ${PROJECT_ID?} --member serviceAccount:${CLOUDBUILD_SA?} --role roles/iam.serviceAccountTokenCreator
gcloud builds submit --config cloudbuild.yaml --substitutions _DNS=$1