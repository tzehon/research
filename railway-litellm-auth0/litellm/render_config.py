"""JSON is valid YAML; no template interpolation of provider keys."""
import json
import os
from pathlib import Path

models = json.loads(os.environ["ALLOWED_MODELS"])
assert models and all(isinstance(m, str) and m for m in models)
config = {
    "model_list": [
        {"model_name": model, "litellm_params": {
            "model": "openai/" + model, "api_key": "os.environ/OPENAI_API_KEY"
        }} for model in models
    ],
    "general_settings": {
        "master_key": "os.environ/LITELLM_MASTER_KEY",
        "database_url": "os.environ/DATABASE_URL",
        "store_prompts_in_spend_logs": False,
    },
    "litellm_settings": {"set_verbose": False},
}
Path("/tmp/lab-config.yaml").write_text(json.dumps(config))
