import React from "react";
import "@pages/newtab/Newtab.css";
import "@pages/newtab/Newtab.scss";

const Newtab = () => {
  return (
    <div className="App">
      <header className="App-header">
        <h6>The color of this paragraph is defined using SASS.</h6>
        <span className="text-lime-400">
          The color of this paragraph is defined using Tailwind CSS.
        </span>
      </header>
    </div>
  );
};

export default Newtab;
