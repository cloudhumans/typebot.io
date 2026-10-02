terraform {
  required_version = ">= 1.10"

  required_providers {
    datadog = {
      source  = "DataDog/datadog"
      version = "4.23.0"
    }
  }

  backend "s3" {
    bucket       = "cloudhumans-production-terraform-state"
    key          = "production/us-east-1/datadog-monitors/typebot.io/datadog"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "datadog" {
  api_url = "https://api.datadoghq.com/"
}
