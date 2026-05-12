import toast from 'react-hot-toast';
import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';
import ResetAdminPasswordModal from '../components/ResetAdminPasswordModal';
import UserForm from '../components/UserForm';
import UsersTable from '../components/UsersTable';
import { usersApi } from '../api/usersApi';
import { useUsers } from '../hooks/useUsers';
import { useState } from 'react';

const UsersPage = () => {
  const { users, loading, error, loadUsers } = useUsers();
  const [saving, setSaving] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState(null);

  const handleCreateAdmin = async (payload) => {
    setSaving(true);
    try {
      const data = await usersApi.createAdmin(payload);
      toast.success(data.message);
      await loadUsers();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    setSaving(true);
    try {
      const data = await usersApi.updateStatus(id, status);
      toast.success(data.message);
      await loadUsers();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleVerifySuperAdminPassword = async (password) => {
    setSaving(true);
    try {
      const data = await usersApi.verifySuperAdminPassword(password);
      toast.success(data.message);
    } catch (requestError) {
      toast.error(requestError.message);
      throw requestError;
    } finally {
      setSaving(false);
    }
  };

  const handleResetAdminPassword = async (payload) => {
    if (!resetPasswordUser) {
      return;
    }

    setSaving(true);
    try {
      const data = await usersApi.resetAdminPassword(resetPasswordUser.id, payload);
      toast.success(data.message);
      setResetPasswordUser(null);
      await loadUsers();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <DashboardHeader title="Users" description="Create admins and control active access." />

      {error ? <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <div className="space-y-6">
        <DashboardPanel title="Add admin">
          <UserForm onSubmit={handleCreateAdmin} loading={saving} />
        </DashboardPanel>

        <DashboardPanel title="User directory">
          {loading ? (
            <div className="h-64 animate-pulse rounded-2xl bg-sky-50" />
          ) : (
            <UsersTable
              users={users}
              onResetPassword={setResetPasswordUser}
              onStatusChange={handleStatusChange}
              loading={saving}
            />
          )}
        </DashboardPanel>
      </div>

      <ResetAdminPasswordModal
        loading={saving}
        onClose={() => setResetPasswordUser(null)}
        onResetPassword={handleResetAdminPassword}
        onVerifySuperAdminPassword={handleVerifySuperAdminPassword}
        user={resetPasswordUser}
      />
    </div>
  );
};

export default UsersPage;
