//import React from "react";
import { Link } from "react-router-dom";
import propTypes from 'prop-types'

const Navbar = ({ isSmall }) => {
  return (
    <div
      className={`bg-purple-400 flex p-4 transition-all duration-300 ${
        isSmall ? "h-12" : "h-16"
      }`}
    >
      <div
        className={`text-black font-semibold ${
          isSmall ? "text-base" : "text-lg"
        } flex items-center ml-4 md:ml-10`}
      >
        <Link to="/">DataLoom</Link>
      </div>
      {isSmall && (<div
        className={`text-black font-semibold ${
          isSmall ? "text-base" : "text-lg"
        } flex items-center ml-auto mr-4`}
      >
        Project Name -- XYZ
      </div>
      )}
      <div className="ml-auto text-black items-end">
        <button
          className={`bg-white rounded-full ${
            isSmall ? "py-1 px-3 text-sm" : "py-2 px-4"
          }`}
        >
          Profile
        </button>
      </div>
    </div>
  );
};

Navbar.propTypes = {
  isSmall:propTypes.bool.isRequired,
};



export default Navbar;
