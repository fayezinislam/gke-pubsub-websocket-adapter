provider "google-beta" {
    version     = "~> 3"
    region      = var.region
    zone        = var.zone
    project     = var.project
}

data "google_project" "project" {
  project_id = var.project
}

# IAM permissions for cloudbuild to use K8s
resource "google_project_iam_member" "cloud_build_GKE_iam" {
  project = data.google_project.project.number
  role    = "roles/container.developer"
  member  = join("",["serviceAccount:",data.google_project.project.number,"@cloudbuild.gserviceaccount.com"])
}

# The GKE cluster on which to run the websockets code
resource "google_container_cluster" "dyson_cluster" {
  project            = var.project
  provider           = google-beta
  name               = "${var.name}-cluster"
  location           = var.zone
  remove_default_node_pool = true
  initial_node_count       = 1

  workload_identity_config {
    identity_namespace = "${var.project}.svc.id.goog"
  }
  node_config {
    workload_metadata_config {
      node_metadata = "GKE_METADATA_SERVER"
    }
    metadata = {
      disable-legacy-endpoints = "true"
    }

    shielded_instance_config {
      enable_integrity_monitoring = true
      enable_secure_boot          = true
    }

  }
}

resource "google_container_node_pool" "dyson_pool" {
  provider = google-beta
  project    = var.project
  name       = "${var.name}-pool"
  location   = var.zone
  cluster    = google_container_cluster.dyson_cluster.name
  node_count = 5 

  management {
    auto_repair = "true"
    auto_upgrade = "true"
  }

  node_config {
    machine_type = "e2-standard-8"  
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]
    metadata = {
      disable-legacy-endpoints = "true"
    }
    workload_metadata_config {
      node_metadata = "GKE_METADATA_SERVER"
    }
    shielded_instance_config {
      enable_integrity_monitoring = true
      enable_secure_boot          = true
    }

  }
}

# Workload Identity IAM binding for Dyson in default namespace.
resource "google_service_account_iam_member" "dyson-sa-workload-identity" {
  service_account_id = google_service_account.dyson.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project}.svc.id.goog[default/dyson]"
  depends_on = [
    google_container_cluster.dyson_cluster
  ]
}

#Role for Pub/Sub
resource "google_project_iam_member" "pub-sub-role" {
  project            = var.project
  role               = "roles/pubsub.editor"
  member             = "serviceAccount:${google_service_account.dyson.email}"
}

# Service account used by Dyson
resource "google_service_account" "dyson" {
  project      = var.project
  account_id   = "dyson-sa"
  display_name = "dyson-sa"
}

# IP for LB
resource "google_compute_global_address" "ip_address" {
  name         = "ftx-gcpfsi-ip"
  project      = var.project

}
