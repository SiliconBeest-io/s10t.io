# AI Usage Policy

This document describes the policy governing the use of AI in the development of and contributions to SiliconBeest.

## General Principles

- The use of AI for development is permitted.
- The use of AI during development does not always need to be disclosed separately. However, when opening a pull request, contributors must follow the [Pull Requests and Issues](#pull-requests-and-issues) policy below.
- Authors and contributors remain responsible for the correctness, quality, and results of any code written with the assistance of AI.

## Review of AI-Assisted Code

Code written with the assistance of AI must be reviewed before it is incorporated into the project.

- At a minimum, the service must be run and the affected functionality must be verified to work as intended.
- Changes involving issues that can only be reproduced or verified in a federated environment, or improvements that require real-world metrics such as performance data, may be reviewed in an appropriate environment upon a separate request. If you need a federation testing environment, follow the instructions in the [contribution guide](CONTRIBUTING.md#development-environment).
- Emergency changes, including hotfixes, may be incorporated without a separate prior review. They may be reviewed after incorporation when necessary.

When code has been written with the assistance of AI, its review must include security considerations. Review all security concerns relevant to the change, including authentication and authorization checks, input validation, exposure of secrets, external communication, and data access. Changes may be requested when the code does not meet the project's security requirements.

## Merge Policy For Maintainers

Maintainers may merge emergency changes, including hotfixes, directly into the `main` branch. For non-emergency changes, review and merging through a pull request is recommended.

## Pull Requests and Issues

- If AI was used to write code or prepare the pull request description, the pull request description must disclose which parts involved AI assistance.
- The disclosure should identify a particular tool or model. ex) `Assisted-by: ChatGPT Codex 5.6 Sol`
- AI use does not need to be disclosed when opening an issue.