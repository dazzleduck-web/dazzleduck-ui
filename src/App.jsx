import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import QueryDashboard from "./querydashboard/QueryDashboard";
import Navbar from "./components/navbar";
import Demo from "./components/package/demo";

function App() {
  return (
    <div>
      <Router>
      <Navbar />
        <Routes>
            <Route path="/" element={<QueryDashboard />} />
            <Route path="/search" element={<QueryDashboard />} />
            <Route path="/demo" element={<Demo />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;
