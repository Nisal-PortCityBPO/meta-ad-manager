const DashboardHeader = ({ title, description, action }) => {
  return (
    <section className="mb-4 flex flex-col justify-between gap-4 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100/80 sm:flex-row sm:items-end">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-sky-600">Workspace</p>
        <h2 className="mt-2 text-3xl font-black text-slate-950">{title}</h2>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </section>
  );
};

export default DashboardHeader;
