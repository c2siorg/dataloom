# DataLoom
Project is to design and implement a web-based GUI for data wrangling, aimed at simplifying the process of managing and transforming tabular datasets. This application will serve as a graphical interface for the powerful Python library, allowing users to perform complex data manipulation tasks without the need for in-depth programming knowledge. 

### Apps and Packages

- `frontend`: a React.js app
- `backend`:  Python(FastAPI) app

### Run Application
**Set Up Environment Variables** :
Create a `.env` file in the `backend` directory and add details as per `.env.sample` file.

**Installing FastApi Backend** : In the `backend` directory, run `python3 -m venv env`, then run `source env/bin/activate` (Mac/Linux) or `. env/scripts/activate` (Windows), then ensure all required dependencies are installed by running `pip install -r requirements.txt`.

**To run the project**, run the following command:
```
cd DataLoom
npm run dev
```

The backend server will start and be accessible at `http://127.0.0.1:8000`.
