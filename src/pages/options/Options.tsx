import React from "react";
import "@pages/options/Options.css";
import { t } from "@src/chrome/i18n";

const Options: React.FC = () => {
  return (
    <div className="container text-neutral-600">{t("optionsContent")}</div>
  );
};

export default Options;
