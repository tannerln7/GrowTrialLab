from .settings import *  # noqa: F401,F403

# Tests should run through the same middleware path as local development.
NODE_ENV = "development"
ENABLE_DEV_AUTH_BYPASS = True
CF_ACCESS_CONFIGURED = False
DEV_AUTH_BYPASS_ENABLED = True
