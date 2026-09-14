import React from "react";
import { createRoot } from "react-dom/client";
import { FriendExperience } from "../app/FriendExperience";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(<FriendExperience />);
