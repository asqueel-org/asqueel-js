# Copyright 2025-2026 Softwell S.r.l.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Sphinx configuration for the Asqueel JS documentation."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

project = "Asqueel JS"
copyright = "2025-2026, Softwell S.r.l."
author = "Softwell S.r.l."
release = json.loads((ROOT / "package.json").read_text())["version"]
version = release

extensions = [
    "myst_parser",
    "sphinxcontrib.mermaid",
]

templates_path = []
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]
# Publish application-developer documentation only. Internal notes stay in Git.
include_patterns = ["index.md", "release-notes.md", "guide/**", "reference/**"]

source_suffix = {".md": "markdown"}
myst_heading_anchors = 3
myst_enable_extensions = ["colon_fence"]
myst_fence_as_directive = ["mermaid"]

html_theme = "sphinx_rtd_theme"
html_title = "Asqueel JS — Developer documentation"
html_theme_options = {"logo_only": True}
html_context = {
    "display_github": True,
    "github_user": "asqueel-org",
    "github_repo": "asqueel-js",
    "github_version": "main",
    "conf_py_path": "/docs/",
}
html_logo = "_static/brand/asqueel-wordmark-inverse.svg"
html_favicon = "_static/brand/favicon.ico"
html_static_path = ["_static"]
html_extra_path = ["pages"]
html_css_files = ["readability.css", "brand.css"]
language = "en"
