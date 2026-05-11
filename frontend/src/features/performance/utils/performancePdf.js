const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-US');

const formatMoney = (value, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  } catch {
    return moneyFormatter.format(Number(value) || 0);
  }
};

const formatNumber = (value) => numberFormatter.format(Math.round(Number(value) || 0));
const formatPercent = (value) => `${(Number(value) || 0).toFixed(2)}%`;
const formatReportDate = (value) => (value ? new Date(value).toLocaleString() : 'Not fetched yet');

const loadImageAsDataUrl = async (src) => {
  const response = await fetch(src);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () =>
        resolve({
          dataUrl: reader.result,
          height: image.naturalHeight,
          width: image.naturalWidth,
        });
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const getContainedImageSize = ({ width, height }, maxWidth, maxHeight) => {
  const ratio = width && height ? width / height : 1;
  const size = {
    width: maxHeight * ratio,
    height: maxHeight,
  };

  if (size.width > maxWidth) {
    size.width = maxWidth;
    size.height = maxWidth / ratio;
  }

  return size;
};

const addWrappedText = (doc, text, x, y, maxWidth, lineHeight = 5) => {
  const lines = doc.splitTextToSize(String(text || ''), maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
};

const addCard = (doc, { x, y, width, height, title, value, accent = [14, 165, 233] }) => {
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(224, 242, 254);
  doc.roundedRect(x, y, width, height, 3, 3, 'FD');
  doc.setTextColor(...accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(String(title).toUpperCase(), x + 4, y + 7);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(15);
  doc.text(String(value), x + 4, y + 18);
};

const addSectionTitle = (doc, title, y) => {
  doc.setTextColor(3, 105, 161);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(String(title).toUpperCase(), 14, y);
  return y + 7;
};

const addInfoPanel = (doc, { x, y, width, height, title, lines, fill = [240, 249, 255], accent = [3, 105, 161] }) => {
  doc.setFillColor(...fill);
  doc.setDrawColor(186, 230, 253);
  doc.roundedRect(x, y, width, height, 3, 3, 'FD');
  doc.setTextColor(...accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(String(title).toUpperCase(), x + 4, y + 6);

  let lineY = y + 12;
  lines.forEach((line) => {
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(`${line.label}:`, x + 4, lineY);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', line.bold ? 'bold' : 'normal');
    addWrappedText(doc, line.value || 'Not available', x + 31, lineY, width - 36, 4);
    lineY += 5;
  });
};

const addTopSpendChart = (doc, rows, y, currency, title = 'Top spend comparison') => {
  let nextY = addSectionTitle(doc, title, y);
  const chartRows = rows.slice(0, 7);
  const maxValue = Math.max(...chartRows.map((item) => item.value), 1);

  chartRows.forEach((item) => {
    const barWidth = (Number(item.value) / maxValue) * 92;
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(String(item.label || 'Untitled').slice(0, 34), 14, nextY);
    doc.setFillColor(224, 242, 254);
    doc.roundedRect(76, nextY - 4, 96, 4, 2, 2, 'F');
    doc.setFillColor(14, 165, 233);
    doc.roundedRect(76, nextY - 4, barWidth, 4, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.text(formatMoney(item.value, currency), 175, nextY);
    nextY += 8;
  });

  return nextY + 5;
};

const addStatusChart = (doc, statuses, y) => {
  let nextY = addSectionTitle(doc, 'Status breakdown', y);
  const colors = [
    [16, 185, 129],
    [245, 158, 11],
    [239, 68, 68],
    [100, 116, 139],
  ];

  statuses.slice(0, 6).forEach((status, index) => {
    const color = colors[index % colors.length];
    doc.setFillColor(...color);
    doc.circle(16, nextY - 2, 2, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`${status.label}: ${formatNumber(status.count)} item${status.count === 1 ? '' : 's'}`, 22, nextY);
    nextY += 7;
  });

  return nextY + 4;
};

const drawPieSlice = (doc, centerX, centerY, radius, startAngle, endAngle, color) => {
  const segmentCount = Math.max(2, Math.ceil((endAngle - startAngle) / 0.18));

  doc.setFillColor(...color);
  for (let index = 0; index < segmentCount; index += 1) {
    const angleA = startAngle + ((endAngle - startAngle) * index) / segmentCount;
    const angleB = startAngle + ((endAngle - startAngle) * (index + 1)) / segmentCount;
    const xA = centerX + Math.cos(angleA) * radius;
    const yA = centerY + Math.sin(angleA) * radius;
    const xB = centerX + Math.cos(angleB) * radius;
    const yB = centerY + Math.sin(angleB) * radius;

    doc.triangle(centerX, centerY, xA, yA, xB, yB, 'F');
  }
};

const addImpressionPieChart = (doc, impressions, y) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  let nextY = y;

  if (nextY > pageHeight - 76) {
    doc.addPage();
    nextY = 18;
  }

  nextY = addSectionTitle(doc, 'Impression metric share', nextY + 5);

  const items = impressions.filter((item) => Number(item.value) > 0).slice(0, 7);
  const total = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const colors = [
    [14, 165, 233],
    [37, 99, 235],
    [16, 185, 129],
    [124, 58, 237],
    [245, 158, 11],
    [239, 68, 68],
    [100, 116, 139],
  ];
  const centerX = 42;
  const centerY = nextY + 26;
  const radius = 20;
  let currentAngle = -Math.PI / 2;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(224, 242, 254);
  doc.roundedRect(14, nextY - 5, 182, 59, 3, 3, 'FD');

  if (items.length && total) {
    items.forEach((item, index) => {
      const value = Number(item.value) || 0;
      const sliceAngle = (value / total) * Math.PI * 2;

      drawPieSlice(doc, centerX, centerY, radius, currentAngle, currentAngle + sliceAngle, colors[index % colors.length]);
      currentAngle += sliceAngle;
    });

    doc.setFillColor(255, 255, 255);
    doc.circle(centerX, centerY, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text(formatNumber(total), centerX, centerY + 1.5, { align: 'center' });
  } else {
    doc.setFillColor(224, 242, 254);
    doc.circle(centerX, centerY, radius, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('No impression data', 80, centerY);
  }

  let legendY = nextY + 4;
  items.forEach((item, index) => {
    const percent = total ? ((Number(item.value) || 0) / total) * 100 : 0;
    doc.setFillColor(...colors[index % colors.length]);
    doc.roundedRect(80, legendY - 3, 4, 4, 1, 1, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(String(item.label || 'Untitled').slice(0, 46), 88, legendY);
    doc.setFont('helvetica', 'normal');
    doc.text(`${formatNumber(item.value)} (${percent.toFixed(1)}%)`, 170, legendY, { align: 'right' });
    legendY += 7;
  });

  return nextY + 62;
};

const addCampaignBudgetChart = (doc, items, y, currency) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  let nextY = y;

  if (nextY > pageHeight - 80) {
    doc.addPage();
    nextY = 18;
  }

  nextY = addSectionTitle(doc, 'Campaign budget allocation', nextY + 5);

  const chartItems = items.slice(0, 8);
  const maxValue = Math.max(...chartItems.map((item) => Number(item.value) || 0), 1);
  const chart = {
    x: 14,
    y: nextY,
    width: 182,
    height: 58,
  };
  const colors = [
    [14, 165, 233],
    [37, 99, 235],
    [16, 185, 129],
    [124, 58, 237],
    [245, 158, 11],
    [239, 68, 68],
    [100, 116, 139],
  ];

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(224, 242, 254);
  doc.roundedRect(chart.x, chart.y - 4, chart.width, chart.height + 22, 3, 3, 'FD');

  [0, 1, 2, 3].forEach((lineIndex) => {
    const gridY = chart.y + 7 + lineIndex * ((chart.height - 18) / 3);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(chart.x + 6, gridY, chart.x + chart.width - 6, gridY);
  });

  if (chartItems.length) {
    const slotWidth = chart.width / chartItems.length;
    chartItems.forEach((item, index) => {
      const value = Number(item.value) || 0;
      const barHeight = Math.max(2, (value / maxValue) * (chart.height - 20));
      const barWidth = Math.min(12, slotWidth * 0.48);
      const barX = chart.x + index * slotWidth + slotWidth / 2 - barWidth / 2;
      const barY = chart.y + chart.height - barHeight;

      doc.setFillColor(...colors[index % colors.length]);
      doc.roundedRect(barX, barY, barWidth, barHeight, 2, 2, 'F');
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.text(formatMoney(value, currency), barX + barWidth / 2, barY - 2, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(String(item.label || 'Campaign').slice(0, 12), barX + barWidth / 2, chart.y + chart.height + 8, { align: 'center' });
    });
  } else {
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('No campaign budget data available.', chart.x + 60, chart.y + 28);
  }

  return chart.y + chart.height + 27;
};

const addRowsTable = (doc, rows, y, currency) => {
  let nextY = addSectionTitle(doc, 'Detail rows', y);
  const pageHeight = doc.internal.pageSize.getHeight();
  const headers = ['Name', 'Status', 'Spend', 'Clicks', 'Reach', 'CTR'];

  doc.setFillColor(240, 249, 255);
  doc.rect(14, nextY - 5, 182, 8, 'F');
  doc.setTextColor(3, 105, 161);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  [14, 88, 111, 133, 154, 176].forEach((x, index) => doc.text(headers[index], x, nextY));
  nextY += 8;

  rows.slice(0, 18).forEach((row) => {
    if (nextY > pageHeight - 18) {
      doc.addPage();
      nextY = 18;
    }

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(String(row.name || 'Untitled').slice(0, 42), 14, nextY);
    doc.setFont('helvetica', 'normal');
    doc.text(String(row.statusLabel || row.status || 'Unknown').slice(0, 16), 88, nextY);
    doc.text(formatMoney(row.spend, currency), 111, nextY);
    doc.text(formatNumber(row.clicks), 133, nextY);
    doc.text(formatNumber(row.reach), 154, nextY);
    doc.text(formatPercent(row.ctr), 176, nextY);
    nextY += 7;
  });

  return nextY;
};

const addClicksReachGraph = (doc, rows, y) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  let nextY = y;

  if (nextY > pageHeight - 78) {
    doc.addPage();
    nextY = 18;
  }

  nextY = addSectionTitle(doc, 'Clicks And Reach', nextY + 8);

  const chart = {
    x: 14,
    y: nextY,
    width: 182,
    height: 56,
  };
  const items = rows.slice(0, 10);
  const values = items.flatMap((item) => [Number(item.clicks) || 0, Number(item.reach) || 0]);
  const maxValue = Math.max(...values, 1);
  const getPoint = (item, index, key) => {
    const x = items.length === 1 ? chart.x + chart.width / 2 : chart.x + (index / (items.length - 1)) * chart.width;
    const yValue = Number(item[key]) || 0;
    const pointY = chart.y + chart.height - (yValue / maxValue) * (chart.height - 8);

    return {
      x,
      y: Math.max(chart.y + 4, Math.min(chart.y + chart.height, pointY)),
    };
  };
  const drawLine = (key, color) => {
    if (!items.length) {
      return;
    }

    doc.setDrawColor(...color);
    doc.setLineWidth(1.4);
    items.forEach((item, index) => {
      if (index === 0) {
        return;
      }

      const previous = getPoint(items[index - 1], index - 1, key);
      const current = getPoint(item, index, key);
      doc.line(previous.x, previous.y, current.x, current.y);
    });

    items.forEach((item, index) => {
      const point = getPoint(item, index, key);
      doc.setFillColor(...color);
      doc.circle(point.x, point.y, 1.2, 'F');
    });
  };

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(224, 242, 254);
  doc.roundedRect(chart.x, chart.y - 4, chart.width, chart.height + 18, 3, 3, 'FD');

  [0, 1, 2, 3].forEach((lineIndex) => {
    const gridY = chart.y + 6 + lineIndex * ((chart.height - 12) / 3);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(chart.x + 6, gridY, chart.x + chart.width - 6, gridY);
  });

  drawLine('reach', [16, 185, 129]);
  drawLine('clicks', [37, 99, 235]);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(37, 99, 235);
  doc.text('Clicks', chart.x + 6, chart.y + chart.height + 10);
  doc.setTextColor(16, 185, 129);
  doc.text('Reach', chart.x + 31, chart.y + chart.height + 10);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.text(`Max ${formatNumber(maxValue)}`, chart.x + chart.width - 28, chart.y + chart.height + 10);

  if (!items.length) {
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('No clicks and reach data available.', chart.x + 62, chart.y + 28);
  }

  return chart.y + chart.height + 24;
};

export const downloadPerformancePdf = async (report, logoSrc) => {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { context, summary, charts, rows } = report;
  const currency = context?.currency || 'USD';
  const generatedAt = new Date(context?.generatedAt || Date.now()).toLocaleString();

  try {
    const logo = await loadImageAsDataUrl(logoSrc);
    const logoSize = getContainedImageSize(logo, 44, 18);
    doc.addImage(logo.dataUrl, 'PNG', 14, 8, logoSize.width, logoSize.height);
  } catch {
    doc.setFillColor(14, 165, 233);
    doc.roundedRect(14, 8, 42, 18, 3, 3, 'F');
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Performance Report', 64, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Generated ${generatedAt}`, 64, 23);

  let y = 34;
  addInfoPanel(doc, {
    x: 14,
    y,
    width: 182,
    height: 20,
    title: 'Last fetch detail',
    lines: [
      {
        label: 'Fetch',
        value: `${formatReportDate(context?.lastFetchedAt)}  |  Token key: ${context?.token?.label || 'Not selected'}`,
        bold: true,
      },
      {
        label: 'Range',
        value: `${context?.dateRange?.label || 'One week'}  |  ${context?.detailLevel?.label || 'Campaign Level'}  |  ${context?.dataWindowNote || 'Saved snapshot'}`,
      },
    ],
  });

  y += 25;
  addInfoPanel(doc, {
    x: 14,
    y,
    width: 182,
    height: 25,
    title: 'Highlighted account scope',
    fill: [239, 246, 255],
    lines: [
      {
        label: 'Brand',
        value: `${context?.brand?.name || 'Not selected'}  |  Social account: ${context?.socialAccount?.name || 'Not available'} (${context?.token?.adsPowerProfile || 'No AdsPower profile'})`,
        bold: true,
      },
      {
        label: 'Profile',
        value: context?.businessProfile?.name || 'Not available',
        bold: true,
      },
    ],
  });

  y += 30;
  addInfoPanel(doc, {
    x: 14,
    y,
    width: 182,
    height: 15,
    title: 'Selected ad account',
    fill: [238, 242, 255],
    accent: [67, 56, 202],
    lines: [
      {
        label: 'Account',
        value: context?.adAccount?.name || 'Not available',
        bold: true,
      },
    ],
  });

  y += 23;
  const cardWidth = 42;
  addCard(doc, { x: 14, y, width: cardWidth, height: 25, title: 'Spend', value: formatMoney(summary.spend, currency) });
  addCard(doc, { x: 61, y, width: cardWidth, height: 25, title: 'Clicks', value: formatNumber(summary.clicks), accent: [37, 99, 235] });
  addCard(doc, { x: 108, y, width: cardWidth, height: 25, title: 'Reach', value: formatNumber(summary.reach), accent: [16, 185, 129] });
  addCard(doc, { x: 155, y, width: cardWidth, height: 25, title: 'CTR', value: formatPercent(summary.ctr), accent: [124, 58, 237] });
  y += 36;

  y = addTopSpendChart(doc, charts.topSpend || [], y, currency);
  y = addStatusChart(doc, charts.statusBreakdown || [], y);
  y = addRowsTable(doc, rows || [], y, currency);
  y = addImpressionPieChart(doc, charts.impressionBreakdown || [], y);
  y = addCampaignBudgetChart(doc, charts.campaignBudget || [], y, currency);
  addClicksReachGraph(doc, charts.clicksReach || [], y);

  doc.save(`performance-report-${new Date().toISOString().slice(0, 10)}.pdf`);
};
