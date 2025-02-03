
# DataLoom: Web-Based GUI for Data Wrangling

## Overview

**DataLoom** is an advanced web-based graphical user interface (GUI) designed to simplify the management and transformation of tabular datasets. By leveraging the powerful Python library, DataLoom enables users to perform complex data wrangling tasks without requiring in-depth programming knowledge. This intuitive application serves both data analysts and non-technical users alike, enabling them to quickly clean, transform, and analyze data in a visual and easy-to-navigate environment.

## Project Structure

The **DataLoom** project is divided into two primary components:

- **Frontend**: A React.js application that provides a modern and interactive interface for data wrangling tasks.
- **Backend**: A Python FastAPI application that handles data processing and serves as the API layer for the frontend.

The frontend communicates with the backend to perform the necessary data manipulation operations and visualize the results in real time. This separation of concerns ensures a scalable and maintainable codebase.

## Prerequisites

To set up and run **DataLoom** on your local machine, ensure that the following software is installed:

- **Node.js** (v14.x or higher): Required for running the frontend React.js application.
- **Python 3.8 or higher**: Necessary for the backend FastAPI application and the data wrangling functionality.
- **Git**: To clone the repository and manage the codebase.

### Optional:

- **PostgreSQL** (or other databases): If you plan to implement persistent data storage for user sessions or dataset logs.

## Setup Instructions

### Step 1: Clone the Repository

Start by cloning the **DataLoom** repository from GitHub to your local machine:

```bash
git clone https://github.com/c2siorg/DataLoom.git
cd DataLoom
```

### Step 2: Set Up Environment Variables

Navigate to the `apps/backend` directory and create a `.env` file. This file will store configuration settings required for the backend services.

```bash
cd apps/backend
cp .env.sample .env
```

Open the `.env` file in your preferred text editor and populate the required variables. You may reference the `.env.sample` file for guidance on the structure and required values.

### Step 3: Install Backend Dependencies

Create a Python virtual environment for the backend services:

```bash
python3 -m venv env
```

Activate the virtual environment:

- **On Windows**:

  ```bash
  .\env\bin\Activate
  ```

- **On macOS/Linux**:

  ```bash
  source env/bin/activate
  ```

Install the required Python dependencies using `pip`:

```bash
pip install -r requirements.txt
```

### Step 4: Install Frontend Dependencies

Navigate to the `apps/frontend` directory and install the necessary Node.js packages:

```bash
cd ../frontend
npm install
```

### Step 5: Run the Application

Now that all dependencies are installed, start both the frontend and backend servers:

- **Start Backend Server**:

  ```bash
  cd ../backend
  uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
  ```

- **Start Frontend Server**:

  ```bash
  cd ../frontend
  npm run dev
  ```

Once both servers are running, you can access the following URLs:

- The backend API will be available at: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- The frontend application will be accessible at: [http://localhost:3000](http://localhost:3000)

## Usage

Upon successful setup, you can access the **DataLoom** interface by opening your browser and navigating to `http://localhost:3000`. The application will allow you to:

- Upload tabular datasets in CSV or Excel formats.
- Perform a variety of data wrangling operations, including data cleaning, transformation, and enrichment.
- Visualize the dataset's structure and apply advanced filters with just a few clicks.

The GUI is designed to make data manipulation accessible for non-technical users while still offering advanced features for more experienced users. The backend handles the heavy lifting, ensuring the frontend remains responsive and easy to navigate.

## Contributing

We welcome contributions from the open-source community. If you'd like to contribute to **DataLoom**, please follow these steps:

1. **Fork the repository**: Create a personal copy of the repository.
2. **Create a new branch**: For any new features or bug fixes, create a new branch from `main`.
3. **Make your changes**: Implement your changes, ensuring they align with the project's coding standards.
4. **Commit your changes**: Write clear, concise commit messages to describe your changes.
5. **Push your changes**: Push your changes to your forked repository.
6. **Create a pull request**: Open a pull request (PR) from your branch to the main repository.

Please ensure your contributions are well-documented and include relevant tests if applicable.

## License

**DataLoom** is licensed under the Apache License 2.0. You can view the full license details in the [LICENSE](LICENSE) file.

## Acknowledgments

We would like to express our gratitude to the open-source community and all contributors who have made **DataLoom** possible. This project would not be the same without your support and expertise.

We also extend special thanks to the developers and researchers behind the underlying libraries and technologies, including **FastAPI**, **React.js**, and **Python Pandas**, which power the data wrangling and user interface functionalities.

For more information and updates, please visit the [DataLoom GitHub repository](https://github.com/c2siorg/DataLoom).
