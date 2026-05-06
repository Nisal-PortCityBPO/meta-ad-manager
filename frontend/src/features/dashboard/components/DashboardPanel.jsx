const DashboardPanel = ({ title, headerAction = null, children, className = '' }) => {
  return (
    <section className={`rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-sky-100/80 ${className}`}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-black text-slate-950">{title}</h3>
          {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
};

export default DashboardPanel;
