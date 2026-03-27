import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import QueryDashboard from "./querydashboard/QueryDashboard";
import Navbar from "./components/navbar";

function App() {
  return (
    <div>
      <Router>
      <Navbar />
        <Routes>
            <Route path="/" element={<QueryDashboard />} />
            <Route path="/search" element={<QueryDashboard />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;
