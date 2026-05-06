const DashboardPanel = ({ title, children, className = '' }) => {
  return (
    <section className={`rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100/80 ${className}`}>
      {title ? <h3 className="mb-4 text-base font-black text-slate-950">{title}</h3> : null}
      {children}
    </section>
  );
};

export default DashboardPanel;
