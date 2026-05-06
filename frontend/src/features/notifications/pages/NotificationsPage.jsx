import DashboardHeader from '../../dashboard/components/DashboardHeader';
import DashboardPanel from '../../dashboard/components/DashboardPanel';

const notifications = [
  {
    id: 1,
    title: 'Session active',
    body: 'Your current login session is valid.',
    time: 'Now',
  },
  {
    id: 2,
    title: 'Admin workspace ready',
    body: 'Profile and dashboard screens are available.',
    time: 'Today',
  },
];

const NotificationsPage = () => {
  return (
    <div>
      <DashboardHeader title="Notifications" description="Account updates and dashboard messages." />

      <DashboardPanel>
        <div className="divide-y divide-sky-50">
          {notifications.map((notification) => (
            <div key={notification.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black text-slate-950">{notification.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{notification.body}</p>
              </div>
              <span className="inline-flex w-fit rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
                {notification.time}
              </span>
            </div>
          ))}
        </div>
      </DashboardPanel>
    </div>
  );
};

export default NotificationsPage;
