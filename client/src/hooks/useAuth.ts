import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

/** Access the logged-in user and login/logout:  const { user, logout } = useAuth(); */
export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
