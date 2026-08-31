#!/usr/bin/env bash
# Facebook Graph API helper for Leish apps
# Usage: ./fb-graph.sh <command> [args]
#
# Commands:
#   app-info [app_id]          - Get app details (default: new app)
#   app-roles [app_id]         - List app roles
#   list-pages                 - List pages you manage
#   list-apps                  - List apps you own
#   archive-old-app            - Archive the old app (1380362253657756)
#   delete-old-app             - Delete the old app (1380362253657756)
#   test-token <token>         - Debug/validate a token
#   user-info                  - Get current user info

set -euo pipefail

NEW_APP="1953314715341668"
OLD_APP="1380362253657756"

# App access tokens (app_id|secret)
NEW_APP_TOKEN="${NEW_APP}|UFKj8qpyD0uamkmrhAg2yNOIoac"
OLD_APP_TOKEN="${OLD_APP}|Da43Zw41n6RoDCPDYZMpgLvnb3A"

FB_API="https://graph.facebook.com/v21.0"

graph_get() {
    local path="$1"
    local token="${2:-$NEW_APP_TOKEN}"
    curl -s "${FB_API}/${path}?access_token=${token}" | python3 -m json.tool 2>/dev/null || \
    curl -s "${FB_API}/${path}?access_token=${token}"
}

case "${1:-help}" in
    app-info)
        APP_ID="${2:-$NEW_APP}"
        TOKEN="${NEW_APP_TOKEN}"
        [[ "$APP_ID" == "$OLD_APP" ]] && TOKEN="$OLD_APP_TOKEN"
        graph_get "$APP_ID" "$TOKEN"
        ;;
    app-roles)
        APP_ID="${2:-$NEW_APP}"
        TOKEN="${NEW_APP_TOKEN}"
        [[ "$APP_ID" == "$OLD_APP" ]] && TOKEN="$OLD_APP_TOKEN"
        graph_get "${APP_ID}/roles" "$TOKEN"
        ;;
    list-pages)
        # Use a user token for this — need a user access token with pages_read_engagement
        echo "Note: Requires a User Access Token with pages_read_engagement scope."
        echo "App access tokens cannot list pages."
        echo ""
        echo "To list pages, use:"
        echo "  curl -s '${FB_API}/me/accounts?access_token=<USER_TOKEN>'"
        ;;
    list-apps)
        echo "=== New App (Leish MCP) ==="
        graph_get "$NEW_APP"
        echo ""
        echo "=== Old App (Leish!) ==="
        graph_get "$OLD_APP" "$OLD_APP_TOKEN"
        ;;
    archive-old-app)
        echo "Archiving old app $OLD_APP..."
        curl -s -X POST "${FB_API}/${OLD_APP}" \
            -d "access_token=${OLD_APP_TOKEN}" \
            -d "archived=true" | python3 -m json.tool
        ;;
    delete-old-app)
        echo "WARNING: This will permanently delete old app $OLD_APP!"
        read -p "Are you sure? (yes/no): " confirm
        if [[ "$confirm" == "yes" ]]; then
            curl -s -X DELETE "${FB_API}/${OLD_APP}?access_token=${OLD_APP_TOKEN}" | python3 -m json.tool
        else
            echo "Aborted."
        fi
        ;;
    test-token)
        TOKEN="${2:?Usage: fb-graph.sh test-token <token>}"
        graph_get "debug_token?input_token=${TOKEN}&access_token=${NEW_APP_TOKEN}"
        ;;
    user-info)
        # Need a user token for /me
        echo "Note: App access tokens cannot query /me."
        echo "Use a User Access Token instead."
        ;;
    help|*)
        cat <<EOF
Facebook Graph API helper for Leish apps

Commands:
  app-info [app_id]       Get app details (default: new app $NEW_APP)
  app-roles [app_id]      List app roles
  list-apps               Show both apps
  archive-old-app         Archive old app $OLD_APP
  delete-old-app          Delete old app $OLD_APP (destructive!)
  test-token <token>      Debug/validate any token

Tokens:
  New app ($NEW_APP): Leish MCP
  Old app ($OLD_APP): Leish! (to be archived)

Usage:
  ./fb-graph.sh app-info
  ./fb-graph.sh app-info $OLD_APP
  ./fb-graph.sh archive-old-app
  ./fb-graph.sh test-token <any_token>
EOF
        ;;
esac
