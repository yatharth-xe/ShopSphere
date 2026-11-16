import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Lock } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const ForcePasswordChange = () => {
  const { user, completeForcedPasswordChange, logout } = useAuth();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await completeForcedPasswordChange(newPassword);
      if (user.role === "seller") navigate("/seller/dashboard", { replace: true });
      else if (user.role === "admin") navigate("/admin/dashboard", { replace: true });
      else if (user.role === "support") navigate("/support/dashboard", { replace: true });
      else if (user.role === "delivery") navigate("/delivery/dashboard", { replace: true });
      else navigate("/", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Could not change your password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white p-8 sm:p-10 rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/40 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Set a new password</h1>
          <p className="text-xs text-slate-500">For your security, change the temporary password before continuing.</p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3.5 rounded-2xl flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-700">
            New password
            <input
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-1 w-full bg-slate-50 text-slate-800 text-sm rounded-xl px-4 py-2.5 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            Confirm new password
            <input
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 w-full bg-slate-50 text-slate-800 text-sm rounded-xl px-4 py-2.5 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-4 rounded-xl shadow-md shadow-emerald-900/20 transition-all disabled:opacity-50 text-sm"
          >
            {loading ? "Saving password..." : "Save new password"}
          </button>
        </form>
        <button onClick={logout} className="w-full text-xs font-semibold text-slate-500 hover:text-slate-800">
          Log out
        </button>
      </div>
    </div>
  );
};

export default ForcePasswordChange;
