# DataLoom

DataLoom is a web-based GUI for data wrangling, designed to simplify working with tabular datasets. The application provides an intuitive interface that allows users to upload, inspect, and transform data without writing code. It acts as a graphical layer over a Python-powered backend to support operations like cleaning, filtering, reshaping, and exporting datasets.


## Apps and Packages

- **frontend**: React.js client interface
- **backend**: Python FastAPI service


## Setup

### 1. Clone the repository

```bash
git clone https://github.com/c2siorg/dataloom
cd dataloom
```

### 2. Install dependencies

From the project root, run:

```bash
npm install
```

This installs all required dependencies for both the backend and frontend through the monorepo setup.

## Environment Variables

Create a `.env` file in the project root and add your database connection details. This is required for storing logs and uploaded dataset metadata.

**Example:**

```env
DATABASE_URI=mongodb://localhost:27017/dataloom
```

Adjust the URI according to your setup (local or cloud database).


## Running the Application

To start both the backend and frontend together, run:

```bash
npm run dev
```

This will:
- Start the FastAPI backend server
- Start the React development server
- Enable hot reloading for both services

Once running, open the frontend in your browser and begin using the interface.

## Backend Access

The backend API will be available at:

```
http://127.0.0.1:8000
```

Swagger/OpenAPI docs may be available depending on configuration.


## Project Structure

```
dataloom/
├── backend/       # FastAPI backend
├── frontend/      # React frontend
├── turbo.json     # Monorepo config
└── package.json
```


## Contributing

If you wish to contribute:

1. Open an issue or select an existing one
2. Discuss changes if needed
3. Submit a pull request with a short summary of the changes
4. Ensure the project builds and runs before submitting

## License

Refer to the LICENSE file contained in the repository.
