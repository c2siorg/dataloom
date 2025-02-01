# Contributing to DataLoom

*First of all, thank you for considering contributing to DataLoom! We welcome contributions from the community. By participating in this project, you agree to abide by our guidelines and our Code of Conduct.*

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Pull Requests](#pull-requests)
- [Development Guidelines](#development-guidelines)
  - [Tech Stack](#tech-stack)
  - [Coding Standards](#coding-standards)
  - [Commit Messages](#commit-messages)
  - [Testing](#testing)
- [Documentation](#documentation)
- [License](#license)
- [Questions](#questions)

---

## Code of Conduct

Please note that this project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [maintainer@example.com](mailto:maintainer@example.com).

---

## How to Contribute

There are several ways you can contribute to DataLoom:

### Reporting Bugs

- **Check the existing issues** to see if your bug has already been reported.
- **Create a new issue** using our [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.md).
- Include a clear description, steps to reproduce, screenshots (if applicable), and the environment details.

### Suggesting Enhancements

- If you have an idea for a new feature or an improvement, please open an issue using the [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.md).
- Describe your idea clearly and, if possible, include mockups or examples.

### Pull Requests

If you want to fix a bug or add a new feature:

1. **Fork the Repository:** Click the fork button at the top right of the repository page.

2. **Clone your Fork:**
   ```bash
   git clone https://github.com/your-username/DataLoom.git
   cd DataLoom
   ```

3. **Create a Branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Make Changes:**
   - Follow our [Coding Standards](#coding-standards).
   - Ensure your changes align with the project's [Tech Stack](#tech-stack).
   - Update tests and documentation as applicable.

5. **Commit Your Changes:**
   - Write clear commit messages (see [Commit Messages](#commit-messages)).

6. **Push Your Branch:**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Open a Pull Request:**
   - Follow the Pull Request Template to provide all necessary information.
   - Link your PR to any related issues.

---

## Development Guidelines

### Tech Stack
DataLoom is built using the following technologies:

- **Frontend:**
Developed using [React.js](https://react.dev/).


- **Backend:**
Built with [Node.js](https://nodejs.org/en) and [Express.js](https://expressjs.com/).


- **Database:**
Utilizes [MongoDB](https://www.mongodb.com/) for data storage.


- **Data Processing:**
Uses [Python](https://www.python.org/) along with popular libraries for data transformation tasks.


- **Version Control:**
Managed with [Git](https://git-scm.com/).


### Coding Standards

- **Formatting:** Use [Prettier](https://prettier.io/) for code formatting to maintain consistency across the codebase.

- **Linting:** Ensure your code passes all linting checks using [ESLint](https://eslint.org/).

- **Comments:** Write clear comments where necessary. Complex logic should be well-documented.

### Commit Messages

Use clear and concise commit messages. A good commit message should include:

- A short summary (less than 50 characters).
- A detailed description if needed (wrapped at 72 characters).
- Reference the issue number when relevant (e.g., Fixes #123).

### Testing

- **Unit Tests:** Ensure that your changes include appropriate unit tests.

- **Manual Testing:** Test the changes manually in the environment before opening a PR.

- **CI/CD:** All tests must pass in our continuous integration pipeline. Please check the CI status for details.

---

## Documentation

- Keep the documentation up-to-date with your changes.
- Update or create new documentation if you add new features or make significant changes.
- Documentation can be found in the `/docs` directory. Follow the same style guidelines as the rest of the project.

---

## License

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

---

## Questions

If you have any questions, feel free to reach out by opening an issue or contacting one of the maintainers at [maintainer@example.com](mailto:maintainer@example.com).

**Thank you for contributing to DataLoom!**
