import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import {
  clickThroughWindowOptions,
  engagedViewWindowOptions,
  normalizeAttributionWindows,
  viewThroughWindowOptions,
} from '../utils/attributionSettings';

const conversionObjectiveValues = new Set(['OUTCOME_LEADS', 'OUTCOME_SALES']);

const AttributionSelect = ({ id, label, value, options, onChange, disabled = false, helperText = '' }) => (
  <label htmlFor={id} className="block">
    <span className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
      {label}
      <Info size={14} className="text-slate-500" strokeWidth={2.4} />
    </span>
    <span className="relative block">
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full appearance-none rounded-xl border border-sky-100 bg-white px-4 pr-11 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={18}
        className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 ${disabled ? 'text-slate-300' : 'text-slate-500'}`}
        strokeWidth={2.8}
      />
    </span>
    {helperText ? <span className="mt-2 block text-xs font-semibold text-slate-400">{helperText}</span> : null}
  </label>
);

const AttributionSettingsPanel = ({ idPrefix = 'attribution', value, onChange, objective = '', mediaType = '' }) => {
  const [expanded, setExpanded] = useState(false);
  const attributionWindows = normalizeAttributionWindows(value);
  const objectiveBlocksExtendedWindows = objective && !conversionObjectiveValues.has(objective);
  const mediaBlocksEngagedView = mediaType && mediaType !== 'video';
  const engagedViewDisabled = objectiveBlocksExtendedWindows || mediaBlocksEngagedView;
  const clickThroughValue = objectiveBlocksExtendedWindows ? '1D' : attributionWindows.clickThrough;
  const engagedViewValue = engagedViewDisabled ? 'NONE' : attributionWindows.engagedView;
  const viewThroughValue = objectiveBlocksExtendedWindows ? 'NONE' : attributionWindows.viewThrough;
  const objectiveNotice = objectiveBlocksExtendedWindows
    ? 'This objective is sent to Meta with 1-day click only. Meta rejects view or engaged-view attribution for this setup.'
    : '';
  const engagedViewNotice = engagedViewDisabled
    ? objectiveNotice || 'Engaged-view is sent only when the selected creative is a video.'
    : 'Sent only when the final creative is a video.';
  const updateWindow = (field, nextValue) => {
    onChange?.({
      ...attributionWindows,
      [field]: nextValue,
    });
  };

  return (
    <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className={`flex w-full items-center justify-between text-left ${expanded ? 'mb-4' : ''}`}
        aria-expanded={expanded}
        aria-controls={`${idPrefix}-body`}
      >
        <h4 className="flex items-center gap-1.5 text-sm font-black text-slate-950">
          Attribution settings
          <Info size={14} className="text-slate-500" strokeWidth={2.4} />
        </h4>
        <ChevronDown
          size={18}
          className={`text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          strokeWidth={2.8}
        />
      </button>
      {expanded ? (
        <div id={`${idPrefix}-body`} className="space-y-4">
          {objectiveNotice ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-700">
              {objectiveNotice}
            </p>
          ) : null}
          <AttributionSelect
            id={`${idPrefix}-click-through`}
            label="Click-through"
            value={clickThroughValue}
            options={clickThroughWindowOptions}
            disabled={objectiveBlocksExtendedWindows}
            helperText={objectiveBlocksExtendedWindows ? 'Meta receives 1-day click for this objective.' : ''}
            onChange={(nextValue) => updateWindow('clickThrough', nextValue)}
          />
          <AttributionSelect
            id={`${idPrefix}-engaged-view`}
            label="Engaged-view (For videos only)"
            value={engagedViewValue}
            options={engagedViewWindowOptions}
            disabled={engagedViewDisabled}
            helperText={engagedViewNotice}
            onChange={(nextValue) => updateWindow('engagedView', nextValue)}
          />
          <AttributionSelect
            id={`${idPrefix}-view-through`}
            label="View-through"
            value={viewThroughValue}
            options={viewThroughWindowOptions}
            disabled={objectiveBlocksExtendedWindows}
            helperText={objectiveBlocksExtendedWindows ? 'View-through is not sent for this objective.' : ''}
            onChange={(nextValue) => updateWindow('viewThrough', nextValue)}
          />
        </div>
      ) : null}
    </div>
  );
};

export default AttributionSettingsPanel;
