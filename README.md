# DataLoom
Project is to design and implement a web-based GUI for data wrangling, aimed at simplifying the process of managing and transforming tabular datasets. This application will serve as a graphical interface for the powerful Python library, allowing users to perform complex data manipulation tasks without the need for in-depth programming knowledge. 



## TurboRepo Setup

Prerequisites
-------------

*   **Node.js**: Ensure you have Node.js version >=18 installed.
*   **TurboRepo**: Install TurboRepo globally or use `npx` to run Turbo commands.
    *   To install globally:
        
            npm install -g turbo
        
    *   Or, use `npx` (no installation required):
        
            npx turbo <command>
        

Setting Up and Running the Project
----------------------------------

1.  **Clone the Repository**:
    
        git clone https://github.com/c2siorg/DataLoom.git
    
        cd DataLoom
    
2.  **Install Dependencies**: Run the following command to install all dependencies for the project:
    
        turbo install
    
3.  **Set Up Environment Variables**: Navigate to the `apps/backend` directory. Create a `.env` file based on the `.env.sample` file provided.
4.  **Start the Development Server**: Use the following command to start the project:
    
        turbo dev
    
    The backend server will be accessible at: [http://127.0.0.1:8000](http://127.0.0.1:8000). The frontend application will start on a local development server.

Troubleshooting TurboRepo Issues
--------------------------------

### TurboRepo Not Found:

If you encounter issues where `turbo` commands are not recognized:

*   Ensure TurboRepo is installed globally (`npm install -g turbo`) or use `npx turbo`.
*   Verify your PATH includes Node.js binaries.

### Dependency Issues:

If you face dependency issues, run the following command to clean up and reinstall all packages:

    turbo prune && turbo install

### Node.js Version Mismatch:

Ensure your Node.js version is >=18 by running:

    node -v

For further guidance, refer to the [TurboRepo documentation](https://turbo.build).


### Apps and Packages

- `frontend`: a React.js app
- `backend`:  Python(FastAPI) app

### Run Application
**Set Up Environment Variables** :
Create a `.env` file in the `apps/backend` directory and add details as per `.env.sample` file.

**Installing FastApi Backend** : In the `apps/backend` directory, run `python3 -m venv env`, then run `. env/scripts/activate` (On Windows), then ensure all required dependencies are installed by running `pip install -r requirements.txt`.

**To run the project**, run the following command:
```
cd DataLoom
npm run dev
```

The backend server will start and be accessible at `http://127.0.0.1:8000`.
