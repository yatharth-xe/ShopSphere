import { useState, useEffect } from "react";
import axiosInstance from "../../api/axiosInstance";
import Loader from "../../components/common/Loader";

const ManageUsers = () => {
  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [staffForm, setStaffForm] = useState({ name: "", email: "", role: "seller" });
  const [staffPassword, setStaffPassword] = useState("");
  const [staffError, setStaffError] = useState("");
  const [staffMessage, setStaffMessage] = useState("");
  const [creatingStaff, setCreatingStaff] = useState(false);

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data } = await axiosInstance.get("/users", { params: roleFilter ? { role: roleFilter } : {} });
      setUsers(data.users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (id, isActive) => {
    await axiosInstance.patch(`/users/${id}/status`, { isActive: !isActive });
    fetchUsers();
  };

  const handleCreateStaff = async (event) => {
    event.preventDefault();
    setStaffError("");
    setStaffMessage("");
    setStaffPassword("");
    setCreatingStaff(true);
    try {
      const { data } = await axiosInstance.post("/users/staff", staffForm);
      setStaffPassword(data.temporaryPassword);
      setStaffMessage(`${data.user.name} was created as ${data.user.role}. Share the temporary password securely; it is shown only once.`);
      setStaffForm({ name: "", email: "", role: "seller" });
      fetchUsers();
    } catch (err) {
      setStaffError(err.response?.data?.message || "Could not create staff account.");
    } finally {
      setCreatingStaff(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Manage Users</h1>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm"
        >
          <option value="">All roles</option>
          <option value="customer">Customer</option>
          <option value="seller">Seller</option>
          <option value="delivery">Delivery</option>
          <option value="support">Support</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <section className="bg-white border rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Create staff account</h2>
        <p className="text-sm text-gray-500 mb-4">The account must change its temporary password at first login.</p>
        {staffError && <p role="alert" className="text-sm text-rose-700 mb-3">{staffError}</p>}
        {staffMessage && <p role="status" className="text-sm text-emerald-700 mb-3">{staffMessage}</p>}
        {staffPassword && (
          <label className="block text-xs font-semibold text-gray-700 mb-4">
            Temporary password (shown once)
            <input readOnly value={staffPassword} className="mt-1 w-full font-mono bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 select-all" />
          </label>
        )}
        <form onSubmit={handleCreateStaff} className="grid gap-3 sm:grid-cols-4">
          <input required maxLength={100} placeholder="Full name" value={staffForm.name}
            onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })}
            className="border rounded-md px-3 py-2 text-sm" />
          <input required type="email" maxLength={254} placeholder="Email address" value={staffForm.email}
            onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })}
            className="border rounded-md px-3 py-2 text-sm" />
          <select value={staffForm.role} onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value })}
            className="border rounded-md px-3 py-2 text-sm">
            <option value="seller">Seller</option>
            <option value="support">Support</option>
            <option value="delivery">Delivery</option>
          </select>
          <button type="submit" disabled={creatingStaff}
            className="rounded-md bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50">
            {creatingStaff ? "Creating..." : "Create account"}
          </button>
        </form>
      </section>

      {loading ? (
        <Loader />
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u._id} className="bg-white border rounded-lg p-3 flex justify-between items-center">
              <div>
                <p className="font-medium text-gray-800">
                  {u.name} <span className="text-xs text-gray-400 capitalize">({u.role})</span>
                </p>
                <p className="text-sm text-gray-500">{u.email}</p>
              </div>
              <button
                onClick={() => handleToggleActive(u._id, u.isActive)}
                className={`text-xs px-3 py-1.5 rounded-md ${
                  u.isActive ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-green-100 text-green-700 hover:bg-green-200"
                }`}
              >
                {u.isActive ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ManageUsers;
