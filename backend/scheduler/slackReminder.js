/**
 * slackReminder.js
 * Scheduled daily Slack notification that summarises shift attendance.
 *
 * Uses:
 *   - node-cron       for scheduling
 *   - @slack/web-api  for Slack Block Kit messages
 *
 * Environment variables consumed:
 *   SLACK_BOT_TOKEN  — Slack bot token (xoxb-...)
 *   SLACK_CHANNEL_ID — Target channel or DM ID
 *   REMINDER_TIME    — cron expression (default: "30 7 * * *")
 *   CRON_TIMEZONE    — IANA timezone (default: "America/New_York")
 */

const cron       = require('node-cron');
const { WebClient } = require('@slack/web-api');
const Attendance = require('../models/Attendance');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a date object to a human-readable string, e.g. "Monday, June 10, 2025" */
function formatDateHeader(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
    timeZone: process.env.CRON_TIMEZONE || 'America/New_York',
  });
}

/** Return a YYYY-MM-DD string for the current date in the configured timezone */
function todayInTimezone() {
  const tz = process.env.CRON_TIMEZONE || 'America/New_York';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Map status → emoji */
const STATUS_EMOJI = {
  'Present':    '✅',
  'Absent':     '❌',
  'Late':       '⚠️',
  'On Leave':   '🔵',
  'Half Day':   '🟡',
  'Not Entered':'❓',
};

/** Map shift → clock emoji */
const SHIFT_EMOJI = {
  '7:00 AM': '🕖',
  '4:30 AM': '🕓',
};

/**
 * Build a Slack Block Kit payload from the attendance summary.
 * @param {string} date       YYYY-MM-DD
 * @param {object} summary    Result of Attendance.getSummary(date)
 * @returns {object[]}        Slack blocks array
 */
function buildBlocks(date, summary) {
  const dateLabel = formatDateHeader(new Date(date + 'T12:00:00Z')); // noon UTC avoids DST edge
  const blocks = [];

  // ── Header ────────────────────────────────────────────────────────────────
  blocks.push({
    type: 'header',
    text: {
      type:  'plain_text',
      text:  `📅 Attendance Report — ${dateLabel}`,
      emoji: true,
    },
  });

  blocks.push({ type: 'divider' });

  // ── Per-shift sections ─────────────────────────────────────────────────────
  const shiftOrder = ['7:00 AM', '4:30 AM'];

  for (const shift of shiftOrder) {
    const shiftData = summary[shift];
    if (!shiftData) continue;

    const emoji = SHIFT_EMOJI[shift] || '🕐';

    // Shift heading
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${emoji} ${shift} Shift*`,
      },
    });

    // Employee lines
    let employeeLines = '';
    for (const emp of shiftData.employees) {
      const statusEmoji = STATUS_EMOJI[emp.status] || '❓';
      let line = `${statusEmoji} *${emp.employee_name}* — ${emp.status}`;
      if (emp.check_in)  line += ` (Check-in: ${emp.check_in})`;
      if (emp.check_out) line += ` | (Check-out: ${emp.check_out})`;
      if (emp.remarks)   line += ` — _${emp.remarks}_`;
      employeeLines += line + '\n';
    }

    if (employeeLines) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: employeeLines.trim() },
      });
    }

    // Summary counts
    const c = shiftData.counts;
    const countParts = [];
    if (c['Present'])    countParts.push(`${c['Present']} Present`);
    if (c['Absent'])     countParts.push(`${c['Absent']} Absent`);
    if (c['Late'])       countParts.push(`${c['Late']} Late`);
    if (c['On Leave'])   countParts.push(`${c['On Leave']} On Leave`);
    if (c['Half Day'])   countParts.push(`${c['Half Day']} Half Day`);
    if (c['Not Entered'])countParts.push(`${c['Not Entered']} Not Entered`);

    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `📊 *Summary:* ${countParts.join(' | ') || 'No data'}`,
      }],
    });

    blocks.push({ type: 'divider' });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `_Sent by Attendance Tracker bot • ${new Date().toISOString()}_`,
    }],
  });

  return blocks;
}

/**
 * Fetch today's attendance summary and post it to Slack.
 * Errors are caught and logged — they do NOT crash the server.
 */
async function sendDailyReminder() {
  const token     = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CHANNEL_ID;

  if (!token || token === 'xoxb-your-slack-bot-token') {
    console.warn('[Slack] SLACK_BOT_TOKEN not configured — skipping reminder');
    return;
  }
  if (!channelId || channelId === 'your-channel-or-user-id') {
    console.warn('[Slack] SLACK_CHANNEL_ID not configured — skipping reminder');
    return;
  }

  try {
    const date    = todayInTimezone();
    const summary = Attendance.getSummary(date);

    if (Object.keys(summary).length === 0) {
      console.info(`[Slack] No employees found for ${date} — skipping reminder`);
      return;
    }

    const blocks = buildBlocks(date, summary);
    const client = new WebClient(token);

    await client.chat.postMessage({
      channel: channelId,
      text:    `📅 Attendance Report — ${date}`,   // fallback text for notifications
      blocks,
    });

    console.info(`[Slack] Daily reminder sent successfully for ${date}`);
  } catch (err) {
    // Log the error but do NOT rethrow — the cron job must remain alive
    console.error('[Slack] Failed to send daily reminder:', err.message);
  }
}

/**
 * Initialise the cron scheduler.
 * Called once at server startup.
 */
function initScheduler() {
  const cronExpr = process.env.REMINDER_TIME || '30 7 * * *';
  const timezone = process.env.CRON_TIMEZONE || 'America/New_York';

  if (!cron.validate(cronExpr)) {
    console.error(`[Scheduler] Invalid cron expression: "${cronExpr}" — scheduler not started`);
    return;
  }

  cron.schedule(cronExpr, sendDailyReminder, {
    timezone,
    scheduled: true,
  });

  console.info(`[Scheduler] Daily Slack reminder scheduled: "${cronExpr}" (${timezone})`);
}

module.exports = { initScheduler, sendDailyReminder };
