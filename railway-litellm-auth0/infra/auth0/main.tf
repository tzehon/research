terraform {
  required_version = ">= 1.6.0"
  required_providers {
    auth0 = { source = "auth0/auth0", version = "1.60.0" }
  }
}

# Management application credentials come from AUTH0_DOMAIN, AUTH0_CLIENT_ID,
# AUTH0_CLIENT_SECRET in the local environment, never from checked-in files.
provider "auth0" {}

variable "name" { type = string }
variable "audience" { type = string }
variable "scope" { type = string }
variable "redirect_port" { type = number }

resource "auth0_resource_server" "gateway" {
  name                   = var.name
  identifier             = var.audience
  signing_alg            = "RS256"
  token_dialect          = "access_token"
  allow_offline_access   = true
  token_lifetime         = 300
  token_lifetime_for_web = 300
}

resource "auth0_resource_server_scopes" "gateway" {
  resource_server_identifier = auth0_resource_server.gateway.identifier
  scopes {
    name        = var.scope
    description = "Invoke models through the Codex lab gateway"
  }
}

resource "auth0_client" "codex" {
  name            = "${var.name}-codex"
  app_type        = "native"
  is_first_party  = true
  oidc_conformant = true
  callbacks       = ["http://127.0.0.1:${var.redirect_port}/callback"]
  grant_types     = ["authorization_code", "refresh_token"]
  jwt_configuration { alg = "RS256" }
  refresh_token {
    rotation_type                = "rotating"
    expiration_type              = "expiring"
    token_lifetime               = 604800
    idle_token_lifetime          = 86400
    infinite_token_lifetime      = false
    infinite_idle_token_lifetime = false
    leeway                       = 10
  }
}

resource "auth0_client_credentials" "codex" {
  client_id             = auth0_client.codex.id
  authentication_method = "none"
}

# An isolated connection makes the lab's identity resources safe to destroy.
# No public self-registration; create lab users in Auth0's dashboard.
resource "auth0_connection" "lab" {
  name     = "${var.name}-users"
  strategy = "auth0"
  options {
    disable_signup  = true
    password_policy = "good"
  }
}

resource "auth0_connection_clients" "lab" {
  connection_id   = auth0_connection.lab.id
  enabled_clients = [auth0_client.codex.id]
}

output "client_id" { value = auth0_client.codex.id }
output "connection_name" { value = auth0_connection.lab.name }
output "audience" { value = auth0_resource_server.gateway.identifier }
