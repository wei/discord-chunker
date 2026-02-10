# Contributing to discord-chunker

Thank you for your interest in contributing! We welcome all contributions to improve this project.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/)

## Development Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/wei/discord-chunker.git
    cd discord-chunker
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```
    This also sets up pre-commit hooks via [Lefthook](https://lefthook.dev/) that automatically run linting and tests before each commit.

3.  **Run tests:**
    ```bash
    pnpm test
    ```

4.  **Lint and format:**
    ```bash
    pnpm run lint          # Check for issues
    pnpm run lint:fix      # Auto-fix issues
    pnpm run format        # Format code
    ```

## Pull Request Process

1.  Create a new branch for your feature or bug fix.
2.  Make your changes and ensure tests pass.
3.  Add tests for new functionality where applicable.
4.  Submit a Pull Request with a clear description of your changes.
5.  All PRs will be reviewed by the maintainers.

By contributing, you agree that your contributions will be licensed under the MIT License.
