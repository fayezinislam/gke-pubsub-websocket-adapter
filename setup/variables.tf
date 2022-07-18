variable "region" {
    type        = string
    description = "Default region for GCP resources"
    default     = "us-east4"
}

variable "zone" {
    type        = string
    description = "Default zone for GCP resources"
    default     = "us-east4-c"
}

variable "project" {
    type        = string
    description = "The project in which to place all new resources"
}

variable "name" {
    type        = string
    description = "Default prefix name for GKE deployment"
    default     = "ftx-com-mktpair"
}

