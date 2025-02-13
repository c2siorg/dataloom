
import './App.css'
import {BrowserRouter as Router, Route, Routes, useLocation} from 'react-router-dom'
import DataScreen from './Components/DataScreen';
import HomeScreen from './Components/Homescreen';
import Navbar from './Components/Navbar';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

function App() {
  return (
    <Router>
       <QueryClientProvider client={queryClient}>
      <AppContent />
      </QueryClientProvider>
    </Router>
  );
}

function AppContent(){
  const location = useLocation();

  return (
    <div>
      <Navbar isSmall = {location.pathname === '/data'} />
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/data" element={<DataScreen />} />
      </Routes>
    </div>
  );
}

export default App
