DataLoom

Project is to design and implement a web-based GUI for data wrangling, aimed at simplifying the process of managing and transforming tabular datasets. This application will serve as a graphical interface for the powerful Python library, allowing users to perform complex data manipulation tasks without the need for in-depth programming knowledge.

Apps and Packages

frontend: a React.js app

backend:  Python (FastAPI) app

Run Application

Set Up Environment Variables

Create a .env file in the apps/backend directory and add details as per .env.sample file.

Installing FastAPI Backend

Navigate to the apps/backend directory:

cd apps/backend

Create and activate a virtual environment:

On Windows:

python3 -m venv env
. env/Scripts/activate

On macOS/Linux:

python3 -m venv env
source env/bin/activate

Install the required dependencies:

pip install -r requirements.txt

Installing Turbo and Dependencies

Install Turbo globally if not already installed:

npm install -g turbo

Navigate to the project root and install dependencies:

cd DataLoom
npm install --legacy-peer-deps

Running the Application

To start the project, run the following command from the root directory:

npm run dev

The backend server will start and be accessible at http://127.0.0.1:8000.

The frontend will run in development mode, utilizing Turbo for monorepo management, and will be accessible at http://localhost:5173/.

