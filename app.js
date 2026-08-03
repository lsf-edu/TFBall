// app.js — gestion de tournois TFBall avec tirage professionnel
const dbName = 'TFBallDB';
const storeName = 'tournaments';
let notificationCount = 0;

// DOM refs
let modalState, notificationButton, notificationBadge, notificationList, openCreateButton, resetDbButton;
let closeButtons, teamInputs, teamCount, tournamentForm, resetButton, tournamentsTable;
let notificationEntries = [];
let tournamentType, statusFilter, refreshButton, summaryContent, summaryModalContent, championText, drawMethod, dashboardShell, dashboardBody, tabButtons, selectedTournament;
let manualScoreModal, manualScoreForm, manualScoreHome, manualScoreAway, manualPenaltyHome, manualPenaltyAway, manualScoreInfo, manualPlayersHomeContainer, manualPlayersAwayContainer, currentManualMatch, currentManualTournament, manualBothForfeit, globalSearch, statsButton, exportImgButton, helpButton, statsChartInstance;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function createSlug(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildAutoTeamLogo(teamName) {
    const safeName = (teamName || 'Equipe').trim().toUpperCase();
    const initials = safeName.split(/[^A-Z0-9]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').slice(0, 2) || 'EQ';
    let hash = 0;
    for (let i = 0; i < safeName.length; i += 1) {
        hash = (hash << 5) - hash + safeName.charCodeAt(i);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
            <rect width="96" height="96" rx="24" fill="hsl(${hue} 70% 18%)" />
            <circle cx="48" cy="40" r="24" fill="hsla(0,0%,100%,0.16)" />
            <path d="M24 76c6-15 18-24 24-24s18 9 24 24" fill="hsla(0,0%,100%,0.22)" />
            <text x="48" y="55" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#f8fafc">${initials}</text>
        </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildAutoTournamentLogo(name) {
    const safeName = (name || 'TFBall').trim().toUpperCase();
    const initials = safeName.split(/[^A-Z0-9]+/).filter(Boolean).slice(0, 3).map(part => part[0]).join('').slice(0, 3) || 'TF';
    let hash = 0;
    for (let i = 0; i < safeName.length; i += 1) {
        hash = (hash << 5) - hash + safeName.charCodeAt(i);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
            <rect width="120" height="120" rx="28" fill="hsl(${hue} 70% 16%)" />
            <circle cx="60" cy="54" r="28" fill="hsla(0,0%,100%,0.16)" />
            <path d="M26 96c8-20 20-30 34-30s26 10 34 30" fill="hsla(0,0%,100%,0.2)" />
            <text x="60" y="64" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="#f8fafc">${initials}</text>
        </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getTournamentLogo(tournament) {
    if (!tournament) return buildAutoTournamentLogo('TFBall');
    if (tournament.logo) return tournament.logo;
    return buildAutoTournamentLogo(tournament.name || 'TFBall');
}

function renderTournamentBadge(tournament) {
    const logo = getTournamentLogo(tournament);
    return `
        <span class="tournament-badge">
            <img class="tournament-badge__logo" src="${logo}" alt="${escapeHtml(tournament?.name || 'Tournoi')}" />
            <span class="tournament-badge__name">${escapeHtml(tournament?.name || 'Tournoi')}</span>
        </span>
    `;
}

function getTeamLogo(tournament, teamName) {
    if (!teamName) return buildAutoTeamLogo('Equipe');
    if (tournament?.teamLogos?.[teamName]) return tournament.teamLogos[teamName];
    return buildAutoTeamLogo(teamName);
}

function renderTeamLabel(teamName, tournament) {
    if (!teamName || teamName === 'TBD' || teamName === 'BYE') {
        return `
            <span class="team-badge team-badge--placeholder">
                <span class="team-badge__name">À déterminer</span>
            </span>
        `;
    }
    if (/^(1er|1ère|2e|2ème|3e|3ème|4e|4ème)\s/i.test(teamName)) {
        return `
            <span class="team-badge team-badge--placeholder">
                <span class="team-badge__name">${escapeHtml(teamName)}</span>
            </span>
        `;
    }
    const logo = getTeamLogo(tournament, teamName);
    return `
        <span class="team-badge">
            <img class="team-badge__logo" src="${logo}" alt="${escapeHtml(teamName)}" />
            <span class="team-badge__name">${escapeHtml(teamName)}</span>
        </span>
    `;
}

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: 'id' });
            }
        };
        request.onsuccess = event => resolve(event.target.result);
        request.onerror = event => reject(event.target.error);
    });
}

async function saveTournament(tournament) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(tournament);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function loadTournaments() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function deleteTournament(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function resetDatabase() {
    if (!window.confirm('Voulez-vous vraiment supprimer toutes les données du tournoi ?')) {
        return;
    }

    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });

        selectedTournament = null;
        if (summaryContent) summaryContent.innerHTML = '<div class="summary-placeholder">Aucun tournoi sélectionné.</div>';
        if (dashboardBody) dashboardBody.innerHTML = '';
        if (tournamentsTable) tournamentsTable.innerHTML = '';

        await refreshList();
        showNotification('Base de données réinitialisée avec succès.', 'success');
    } catch (error) {
        console.error('Erreur lors de la réinitialisation de la base de données.', error);
        showNotification('Impossible de réinitialiser la base de données.', 'error');
    }
}

function showModal(id) {
    const modal = modalState[id];
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
}

function collectTournamentMatches(tournament) {
    const allMatches = [];
    if (tournament.type === 'GroupKnockout') {
        (tournament.groups || []).forEach(group => {
            allMatches.push(...(group.matches || []));
        });
    }
    allMatches.push(...((tournament.bracket || []).flatMap(round => round.matches || [])));
    return allMatches;
}

function hasAllMatchesPlayed(tournament) {
    const allMatches = collectTournamentMatches(tournament);
    return allMatches.length > 0 ? allMatches.every(match => typeof match.scoreHome === 'number' && typeof match.scoreAway === 'number') : false;
}

function showFinalCelebration(tournament) {
    if (!tournament || !championText || !modalState?.finalModal) return;
    if (tournament.status !== 'Terminé') return;

    const champion = determineChampion(tournament) || tournament.champion;
    if (!champion) return;
    if (tournament.celebrationShown) return;

    tournament.champion = champion;
    tournament.celebrationShown = true;
    championText.textContent = `${champion} remporte le trophée !`;
    showModal('finalModal');
}

function hideModal(id) {
    const modal = modalState[id];
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');

    if (id === 'notificationModal') {
        notificationEntries = [];
        if (notificationList) {
            notificationList.innerHTML = '<p>Aucune notification pour le moment.</p>';
        }
        markNotificationsAsViewed();
    }
}

function renderNotificationList() {
    if (!notificationList) return;

    if (!notificationEntries.length) {
        notificationList.innerHTML = '<p>Aucune notification pour le moment.</p>';
        return;
    }

    notificationList.innerHTML = '';
    notificationEntries.forEach(entryData => {
        const entry = document.createElement('div');
        entry.className = `notification-entry ${entryData.className}`;
        entry.innerHTML = `
            <div class="notification-entry__icon">${entryData.icon}</div>
            <div class="notification-entry__content">
                <div class="notification-entry__title">${entryData.title}</div>
                <div class="notification-entry__message">${entryData.message}</div>
            </div>
        `;
        notificationList.appendChild(entry);
    });
}

function markNotificationsAsViewed() {
    notificationCount = 0;
    if (notificationBadge) {
        notificationBadge.textContent = '0';
        notificationBadge.classList.add('hidden');
    }
}

function showNotification(message, type = 'info') {
    notificationCount += 1;
    if (notificationBadge) {
        notificationBadge.textContent = notificationCount;
        notificationBadge.classList.remove('hidden');
    }

    const config = {
        info: { title: 'Information', icon: '<i class="fa-solid fa-bell" aria-hidden="true"></i>', className: 'info' },
        success: { title: 'Succès', icon: '<i class="fa-solid fa-check" aria-hidden="true"></i>', className: 'success' },
        error: { title: 'Erreur', icon: '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>', className: 'error' },
    };
    const style = config[type] || config.info;
    notificationEntries.push({
        message,
        title: style.title,
        icon: style.icon,
        className: style.className,
    });

    const stack = document.getElementById('notificationStack');
    if (stack) {
        const toast = document.createElement('div');
        toast.className = `notification-toast ${style.className}`;
        toast.innerHTML = `
            <div class="notification-toast__icon">${style.icon}</div>
            <div class="notification-toast__content">
                <div class="notification-toast__title">${style.title}</div>
                <div class="notification-toast__message">${message}</div>
            </div>
        `;
        stack.appendChild(toast);
        window.setTimeout(() => {
            toast.classList.add('is-leaving');
        }, 3800);
        window.setTimeout(() => {
            toast.remove();
        }, 4300);
    }

    if (notificationList && !modalState?.notificationModal?.classList.contains('hidden')) {
        renderNotificationList();
    }
}

function makeStatusBadge(status) {
    const span = document.createElement('span');
    span.className = 'status-badge';
    if (status === 'Ouvert') span.classList.add('status-open');
    else if (status === 'En cours') span.classList.add('status-progress');
    else span.classList.add('status-finished');
    span.textContent = status;
    return span;
}

function computeStandings(teams) {
    return teams.map(team => ({ team, points: 0, played: 0, goalDiff: 0, badge: '' }));
}

function sortStandings(standings) {
    return standings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.goalDiff - a.goalDiff;
    });
}

function refreshTournamentStandings(tournament) {
    const standings = computeStandings(tournament.teams);
    if (tournament.type === 'GroupKnockout') {
        (tournament.groups || []).forEach(group => {
            group.matches.forEach(match => applyResultsToStandings(standings, match));
        });
    }
    tournament.bracket?.forEach(round => {
        round.matches.forEach(match => applyResultsToStandings(standings, match));
    });
    tournament.table = sortStandings(standings).map((row, index, arr) => ({
        ...row,
        badge: getBadgeForPosition(index, arr.length, tournament.type),
    }));
}

function getBadgeForPosition(index, total, tournamentType) {
    if (tournamentType === 'Championship') {
        if (index <= 2) return 'green-row';
        if (total <= 8 && index >= total - 2) return 'red-row';
        if (total > 8 && index >= total - 4) return 'red-row';
        return 'warning-row';
    }
    if (tournamentType === 'GroupKnockout') {
        const qualifiers = Math.min(2, Math.max(1, total));
        const eliminated = Math.min(2, Math.max(1, total));
        if (index < qualifiers) return 'green-row qualified';
        if (index >= total - eliminated) return 'red-row eliminated';
        return 'warning-row';
    }
    if (index <= 1) return 'green-row';
    if (index >= total - 2) return 'red-row';
    return 'warning-row';
}

function createMatchEvents(match) {
    if (match.away === 'BYE') {
        return [{ time: '-', description: 'Forfait, match non joué' }];
    }
    const events = [];
    const totalGoals = (match.scoreHome || 0) + (match.scoreAway || 0);
    let minute = 10;
    for (let i = 0; i < match.scoreHome; i += 1) {
        events.push({ time: `${Math.min(90, minute)}'`, description: `But pour ${match.home}` });
        minute += 8 + Math.floor(Math.random() * 7);
    }
    for (let i = 0; i < match.scoreAway; i += 1) {
        events.push({ time: `${Math.min(90, minute)}'`, description: `But pour ${match.away}` });
        minute += 8 + Math.floor(Math.random() * 7);
    }
    return events.sort((a, b) => parseInt(a.time, 10) - parseInt(b.time, 10));
}

async function simulateMatch(match) {
    if (match.scoreHome != null && match.scoreAway != null) return;
    await sleep(0);
    match.scoreHome = Math.floor(Math.random() * 5);
    match.scoreAway = Math.floor(Math.random() * 5);
    match.events = createMatchEvents(match);
}

function ensureMatchEvents(bracket) {
    bracket?.forEach(round => {
        round.matches.forEach(match => {
            if (!match.events || !match.events.length) {
                match.events = createMatchEvents(match);
            }
        });
    });
}

async function simulateMatches(matches) {
    for (let i = 0; i < matches.length; i += 1) {
        await simulateMatch(matches[i]);
    }
}

function applyResultsToStandings(standings, match) {
    if (match.scoreHome == null || match.scoreAway == null) {
        if (match.forfeitBoth) {
            const homeRow = standings.find(row => row.team === match.home);
            const awayRow = standings.find(row => row.team === match.away);
            if (!homeRow || !awayRow) return;
            homeRow.played += 1;
            awayRow.played += 1;
            homeRow.goalDiff -= 3;
            awayRow.goalDiff -= 3;
            return;
        }
        return;
    }
    const homeRow = standings.find(row => row.team === match.home);
    const awayRow = standings.find(row => row.team === match.away);
    if (!homeRow || !awayRow) return;
    homeRow.played += 1;
    awayRow.played += 1;
    homeRow.goalDiff += match.scoreHome - match.scoreAway;
    awayRow.goalDiff += match.scoreAway - match.scoreHome;
    if (match.scoreHome > match.scoreAway) homeRow.points += 3;
    else if (match.scoreHome < match.scoreAway) awayRow.points += 3;
    else {
        homeRow.points += 1;
        awayRow.points += 1;
    }
}

function shuffleArray(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function seededDraw(teams) {
    const ordered = [...teams];
    const drawn = [];
    let left = 0;
    let right = ordered.length - 1;
    while (left <= right) {
        if (left === right) {
            drawn.push(ordered[left]);
            break;
        }
        drawn.push(ordered[left]);
        drawn.push(ordered[right]);
        left += 1;
        right -= 1;
    }
    return drawn;
}

function potsDraw(teams) {
    const shuffled = shuffleArray(teams);
    const pots = [];
    const potSize = Math.ceil(shuffled.length / 4);
    for (let i = 0; i < 4; i += 1) {
        pots.push(shuffled.slice(i * potSize, (i + 1) * potSize));
    }
    const drawn = [];
    const maxRows = Math.max(...pots.map(p => p.length));
    for (let row = 0; row < maxRows; row += 1) {
        pots.forEach(pot => {
            if (pot[row]) drawn.push(pot[row]);
        });
    }
    return drawn;
}

function applyDrawMethod(teams, method) {
    if (method === 'seeded') return seededDraw(teams);
    if (method === 'pots') return potsDraw(teams);
    return shuffleArray(teams);
}

function getRoundName(size, totalTeams = null) {
    if (size === 2) return 'Finale';
    if (size === 4) return 'Demi-finales';
    if (size === 8) {
        if (totalTeams === 8) return '1/8 de finale';
        return 'Quarts de finale';
    }
    if (size === 16) {
        if (totalTeams === 16) return '1/16 de finale';
        return 'Huitièmes de finale';
    }
    if (size === 32) {
        if (totalTeams === 32) return '1/32 de finale';
        return 'Seizièmes de finale';
    }
    if (size === 64) return '32èmes de finale';
    return `Tour des ${size}`;
}

function getGroupStageConfig(teamCount) {
    if (teamCount <= 8) return { groupSize: 4, groupCount: Math.max(2, Math.ceil(teamCount / 4)) };
    if (teamCount <= 16) return { groupSize: 4, groupCount: 4 };
    if (teamCount <= 24) return { groupSize: 4, groupCount: 6 };
    if (teamCount <= 32) return { groupSize: 4, groupCount: 8 };
    return { groupSize: 4, groupCount: Math.max(8, Math.ceil(teamCount / 4)) };
}

function getKnockoutRoundSequence(teamCount) {
    const rounds = [];
    let current = teamCount;
    while (current > 1) {
        rounds.push(current);
        current = Math.ceil(current / 2);
    }
    return rounds;
}

function normalizeBracketTeams(teams) {
    const normalized = (teams || [])
        .map(team => (typeof team === 'string' ? team.trim() : ''))
        .filter(Boolean);

    if (!normalized.length) return [];

    let padded = [...normalized];
    while (padded.length % 2 === 1) {
        padded.push('BYE');
    }
    return padded;
}

function buildPlaceholderQualifierSlots(groups) {
    const groupLabels = (groups || []).map((_, index) => String.fromCharCode(65 + index));
    if (!groupLabels.length) return [];

    const placeholderTeams = [];
    for (let i = 0; i < groupLabels.length; i += 1) {
        const nextGroup = groupLabels[(i + 1) % groupLabels.length];
        placeholderTeams.push(`1er ${groupLabels[i]}`);
        placeholderTeams.push(`2e ${nextGroup}`);
    }
    return placeholderTeams;
}

function buildWorldCupGroups(teams, groupSize = 4) {
    const orderedTeams = normalizeBracketTeams(teams);
    if (!orderedTeams.length) return [];

    const config = getGroupStageConfig(orderedTeams.length);
    const groups = [];
    const groupCount = config.groupCount;
    const effectiveGroupSize = Math.max(2, Math.min(groupSize, Math.ceil(orderedTeams.length / groupCount)));
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
        const start = groupIndex * effectiveGroupSize;
        const groupTeams = orderedTeams.slice(start, start + effectiveGroupSize);
        if (groupTeams.length < 2) continue;
        groups.push({
            name: `Groupe ${String.fromCharCode(65 + groupIndex)}`,
            teams: groupTeams,
            rounds: [],
            matches: [],
        });
    }

    return groups;
}

function buildKnockoutBracket(teams, options = {}) {
    const bracket = [];
    let roundTeams = normalizeBracketTeams(teams);

    if (!roundTeams.length) return bracket;

    const totalTeams = options.totalTeams ?? roundTeams.length;
    const rounds = getKnockoutRoundSequence(roundTeams.length);
    rounds.forEach(size => {
        const matches = [];
        for (let i = 0; i < size; i += 2) {
            const home = roundTeams[i];
            const away = roundTeams[i + 1] ?? 'BYE';
            matches.push({ home, away, scoreHome: null, scoreAway: null, events: [] });
        }
        bracket.push({ name: getRoundName(size, totalTeams), matches });
        if (size > 2) {
            roundTeams = Array.from({ length: Math.ceil(size / 2) }, () => 'TBD');
        }
    });

    return bracket;
}

function determineMatchWinner(match) {
    if (match.scoreHome == null || match.scoreAway == null) return null;
    if (match.scoreHome > match.scoreAway) return match.home;
    if (match.scoreAway > match.scoreHome) return match.away;
    if (match.penaltiesHome != null && match.penaltiesAway != null) {
        return match.penaltiesHome > match.penaltiesAway ? match.home : match.away;
    }
    return null;
}

function advanceKnockoutBracket(bracket) {
    if (!bracket || !bracket.length) return;

    for (let roundIndex = 0; roundIndex < bracket.length - 1; roundIndex += 1) {
        const round = bracket[roundIndex];
        const nextRound = bracket[roundIndex + 1];

        round.matches.forEach((match, matchIndex) => {
            const winner = determineMatchWinner(match);
            if (!winner) return;

            const nextMatchIndex = Math.floor(matchIndex / 2);
            const nextMatch = nextRound.matches[nextMatchIndex];
            if (!nextMatch) return;

            const targetSide = matchIndex % 2 === 0 ? 'home' : 'away';
            if (nextMatch[targetSide] !== winner) {
                nextMatch[targetSide] = winner;
                nextMatch.scoreHome = null;
                nextMatch.scoreAway = null;
                nextMatch.events = [];
            }

            if (nextMatch.home === 'BYE' && nextMatch.away !== 'BYE' && nextMatch.away !== 'TBD') {
                nextMatch.scoreHome = 0;
                nextMatch.scoreAway = 1;
                nextMatch.events = createMatchEvents(nextMatch);
            }
            if (nextMatch.away === 'BYE' && nextMatch.home !== 'BYE' && nextMatch.home !== 'TBD') {
                nextMatch.scoreHome = 1;
                nextMatch.scoreAway = 0;
                nextMatch.events = createMatchEvents(nextMatch);
            }
        });
    }
}

function orderMatchesWithinRound(matches) {
    const ordered = [];
    const remaining = [...matches];

    while (remaining.length) {
        let selected = remaining[0];
        let bestScore = Number.POSITIVE_INFINITY;
        let selectedTeams = [];

        remaining.forEach(match => {
            const usedTeams = ordered.length ? [ordered[ordered.length - 1].home, ordered[ordered.length - 1].away] : [];
            const teamOverlap = (match.home === usedTeams[0] || match.home === usedTeams[1] || match.away === usedTeams[0] || match.away === usedTeams[1]) ? 1 : 0;
            const teamRepeatPenalty = Array.from(new Set(ordered.flatMap(item => [item.home, item.away]))).filter(team => team === match.home || team === match.away).length;
            const score = teamOverlap + teamRepeatPenalty;
            if (score < bestScore) {
                bestScore = score;
                selected = match;
                selectedTeams = [match.home, match.away];
            }
        });

        ordered.push(selected);
        const index = remaining.findIndex(match => match === selected);
        remaining.splice(index, 1);
    }

    return ordered;
}

function buildRoundRobinRounds(teams) {
    const orderedTeams = [...teams];
    if (orderedTeams.length % 2 === 1) {
        orderedTeams.push('BYE');
    }

    const rounds = [];
    const rotatingTeams = [...orderedTeams];
    const totalRounds = rotatingTeams.length - 1;

    for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
        const matches = [];
        for (let i = 0; i < rotatingTeams.length / 2; i += 1) {
            const home = rotatingTeams[i];
            const away = rotatingTeams[rotatingTeams.length - 1 - i];
            if (home === 'BYE' || away === 'BYE') continue;
            matches.push({ home, away, scoreHome: null, scoreAway: null, events: [] });
        }
        rounds.push({ name: `Journée ${roundIndex + 1}`, matches: orderMatchesWithinRound(matches) });
        const lastTeam = rotatingTeams.pop();
        rotatingTeams.splice(1, 0, lastTeam);
    }

    return rounds;
}

function createTournamentSchedule(tournament) {
    const orderedTeams = applyDrawMethod(tournament.teams, tournament.drawMethod);
    if (tournament.type === 'Championship') {
        tournament.bracket = buildRoundRobinRounds(orderedTeams);
        return;
    }

    if (tournament.type === 'Knockout') {
        tournament.bracket = buildKnockoutBracket(orderedTeams, { totalTeams: orderedTeams.length });
        return;
    }

    if (tournament.type === 'GroupKnockout') {
        const groups = generateGroupStage(orderedTeams);
        tournament.groups = groups;
        const qualifiers = buildPlaceholderQualifierSlots(groups);
        tournament.bracket = buildKnockoutBracket(qualifiers, { totalTeams: qualifiers.length });
        return;
    }
}

function normalizeGroupStageMatches(group) {
    if (!group || !Array.isArray(group.rounds)) return group;

    const linkedMatches = [];
    group.rounds.forEach(round => {
        (round.matches || []).forEach(match => {
            if (!match) return;
            match.groupName = group.name;
            match.roundName = round.name;
            linkedMatches.push(match);
        });
    });

    group.matches = linkedMatches;
    return group;
}

function normalizeTournamentGroupStructure(tournament) {
    if (!tournament || tournament.type !== 'GroupKnockout' || !Array.isArray(tournament.groups)) return tournament;
    tournament.groups.forEach(group => normalizeGroupStageMatches(group));
    return tournament;
}

function generateGroupStage(teams) {
    const groups = buildWorldCupGroups(teams, 4);
    return groups.map(group => {
        const rounds = buildRoundRobinRounds(group.teams);
        const matches = [];
        rounds.forEach(round => {
            (round.matches || []).forEach(match => {
                match.groupName = group.name;
                match.roundName = round.name;
                matches.push(match);
            });
        });
        return { ...group, rounds, matches };
    });
}

function buildGroupBracket(groups) {
    const qualified = [];
    const groupStageComplete = (groups || []).every(group => (group.matches || []).every(match => match.scoreHome != null && match.scoreAway != null));
    if (!groupStageComplete) return [];

    (groups || []).forEach(group => {
        const standings = computeStandings(group.teams);
        (group.matches || []).forEach(match => applyResultsToStandings(standings, match));
        let sorted = sortStandings(standings);
        sorted = sorted.map((row, index) => ({
            ...row,
            badge: getBadgeForPosition(index, sorted.length, 'GroupKnockout'),
        }));
        group.standings = sorted;
        if (sorted[0]) qualified.push(sorted[0].team);
        if (sorted[1]) qualified.push(sorted[1].team);
    });
    return buildKnockoutBracket(qualified, { totalTeams: qualified.length });
}

function determineMatchWinner(match) {
    if (match.scoreHome == null || match.scoreAway == null) return null;
    if (match.scoreHome > match.scoreAway) return match.home;
    if (match.scoreAway > match.scoreHome) return match.away;
    return null;
}

function determineChampion(tournament) {
    if (tournament.type === 'Championship' && tournament.table) {
        return tournament.table[0]?.team || null;
    }
    if ((tournament.type === 'Knockout' || tournament.type === 'GroupKnockout') && tournament.bracket) {
        const finalRound = tournament.bracket[tournament.bracket.length - 1];
        const match = finalRound?.matches?.[0];
        if (!match) return null;
        const winner = determineMatchWinner(match);
        if (winner) return winner;
        if (match.home === 'BYE') return match.away;
        if (match.away === 'BYE') return match.home;
        return null;
    }
    return null;
}

function finalizeTournamentState(tournament) {
    if (!tournament) return tournament;

    tournament.champion = determineChampion(tournament);
    tournament.status = hasAllMatchesPlayed(tournament) ? 'Terminé' : 'En cours';

    if (tournament.status === 'Terminé') {
        showFinalCelebration(tournament);
    }

    return tournament;
}

async function simulateTournament(tournament) {
    tournament.status = 'En cours';
    if (tournament.type === 'Championship') {
        const standings = computeStandings(tournament.teams);
        const schedule = [];
        for (let i = 0; i < tournament.teams.length; i += 1) {
            for (let j = i + 1; j < tournament.teams.length; j += 1) {
                const match = { home: tournament.teams[i], away: tournament.teams[j], scoreHome: null, scoreAway: null };
                await simulateMatch(match);
                schedule.push(match);
                applyResultsToStandings(standings, match);
            }
        }
        tournament.bracket = [{ name: 'Tous les matchs', matches: schedule }];
        tournament.table = sortStandings(standings).map((row, index, arr) => ({ ...row, badge: getBadgeForPosition(index, arr.length) }));
        tournament.champion = determineChampion(tournament);
        tournament.status = 'Terminé';
        return;
    }

    if (tournament.type === 'Knockout') {
        tournament.bracket = buildKnockoutBracket(tournament.teams, { totalTeams: tournament.teams.length });
        for (const round of tournament.bracket) {
            await simulateMatches(round.matches);
            advanceKnockoutBracket(tournament.bracket);
        }
        tournament.champion = determineChampion(tournament);
        tournament.status = 'Terminé';
        return;
    }

    if (tournament.type === 'GroupKnockout') {
        const groups = generateGroupStage(tournament.teams);
        tournament.groups = groups;
        for (const group of groups) {
            await simulateMatches(group.matches);
            const standings = computeStandings(group.teams);
            group.matches.forEach(match => applyResultsToStandings(standings, match));
            group.standings = sortStandings(standings);
        }
        tournament.bracket = buildGroupBracket(groups);
        if (tournament.bracket?.length) {
            for (const round of tournament.bracket) {
                await simulateMatches(round.matches);
                advanceKnockoutBracket(tournament.bracket);
            }
        }
        finalizeTournamentState(tournament);
    }
}

function buildCompactSharePayload(tournament) {
    if (!tournament) return null;

    return {
        i: tournament.id,
        n: tournament.name,
        t: tournament.type,
        s: tournament.status,
        se: tournament.season,
        c: tournament.champion,
        te: (tournament.teams || []).map(team => (typeof team === 'string' ? team : team?.name || team)),
        ta: (tournament.table || []).map(row => [row.team, row.points, row.goalDiff, row.played, row.badge]),
        g: (tournament.groups || []).map(group => ({
            n: group.name,
            st: (group.standings || []).map(row => [row.team, row.points, row.goalDiff, row.played, row.badge]),
            r: (group.rounds || []).map(round => ({
                n: round.name,
                m: (round.matches || []).map(match => [match.home, match.away, match.scoreHome, match.scoreAway])
            }))
        })),
        br: (tournament.bracket || []).map(round => ({
            n: round.name,
            m: (round.matches || []).map(match => [match.home, match.away, match.scoreHome, match.scoreAway])
        }))
    };
}

function encodeBase64Url(bytes) {
    let binary = '';
    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function decodeBase64Url(value) {
    const normalizedValue = String(value || '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    const paddingNeeded = (4 - (normalizedValue.length % 4)) % 4;
    const paddedValue = `${normalizedValue}${'='.repeat(paddingNeeded)}`;
    const binary = atob(paddedValue);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function encodeTournamentPayload(tournament) {
    const payload = buildCompactSharePayload(tournament);
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);

    if (typeof CompressionStream === 'function') {
        try {
            const compressedStream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
            const compressedBytes = new Uint8Array(await new Response(compressedStream).arrayBuffer());
            return encodeBase64Url(compressedBytes);
        } catch (error) {
            console.warn('Compression du lien de partage indisponible, fallback sur l’encodage simple.', error);
        }
    }

    return encodeBase64Url(bytes);
}

async function createExportLink(id, tournament = null) {
    const baseUrl = new URL('manager.html', window.location.href);
    baseUrl.searchParams.set('id', id);
    if (tournament) {
        const compactPayload = await encodeTournamentPayload(tournament);
        baseUrl.hash = `d=${compactPayload}`;
    }
    return baseUrl.toString();
}

async function copyTournamentLink(tournament) {
    const link = await createExportLink(tournament.id, tournament);
    tournament.exportLink = link;
    await saveTournament(tournament);

    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        return true;
    }

    const helper = document.createElement('textarea');
    helper.value = link;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.left = '-9999px';
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
    return true;
}

function buildTournamentSummary(tournament) {
    const container = document.createElement('div');
    container.className = 'summary-details';
    container.innerHTML = `
    <div class="tournament-summary-hero">${renderTournamentBadge(tournament)}</div>
    <div class="summary-detail-row"><strong>Nom :</strong> ${tournament.name}</div>
    <div class="summary-detail-row"><strong>Type :</strong> ${tournament.type}</div>
    <div class="summary-detail-row"><strong>Méthode de tirage :</strong> ${tournament.drawMethod || 'Aléatoire'}</div>
    <div class="summary-detail-row"><strong>Statut :</strong> ${tournament.status}</div>
    <div class="summary-detail-row"><strong>Équipes :</strong> ${tournament.teams.length}</div>
    <div class="summary-detail-row"><strong>Saison :</strong> ${tournament.season || 'Non précisée'}</div>
  `;

    if (tournament.teamPlayers && Object.keys(tournament.teamPlayers).length) {
        const rosterSection = document.createElement('div');
        rosterSection.className = 'summary-details';
        rosterSection.innerHTML = '<h3>Effectifs par équipe</h3>';
        const rosterList = document.createElement('div');
        rosterList.className = 'roster-list';
        Object.entries(tournament.teamPlayers).forEach(([teamName, players]) => {
            const card = document.createElement('div');
            card.className = 'roster-card';
            card.innerHTML = `
                <div class="roster-card__title">${escapeHtml(teamName)}</div>
                <ul class="roster-items">
                    ${players.map(player => `<li><strong>${escapeHtml(player.name)}</strong> — ${escapeHtml(player.position || 'Joueur')} • ${escapeHtml(player.role || 'Équipier')}</li>`).join('')}
                </ul>
            `;
            rosterList.appendChild(card);
        });
        rosterSection.appendChild(rosterList);
        container.appendChild(rosterSection);
    }

    if (tournament.bracket?.length) {
        // progression
        const stages = getProgressStages(tournament);
        if (stages && stages.length) {
            const percent = computeProgressPercent(stages);
            const progress = document.createElement('div');
            progress.className = 'progress-container';
            progress.innerHTML = `<div class="progress-label">Progression : ${percent}%</div><div class="progress-bar"><div class="progress-fill" style="width: ${percent}%;"></div></div>`;
            container.appendChild(progress);

            const stageBox = document.createElement('div');
            stageBox.className = 'stage-list';
            stages.forEach(s => {
                const item = document.createElement('div');
                item.className = `stage-item ${s.status}`;
                item.innerHTML = `<span class="stage-label">${s.label}</span><span class="stage-badge">${s.status === 'completed' ? '✓' : s.status === 'in-progress' ? '…' : '•'}</span>`;
                stageBox.appendChild(item);
            });
            container.appendChild(stageBox);
        }
        const details = document.createElement('div');
        details.className = 'summary-details';
        details.innerHTML = '<h3>Matchs et événements</h3>';

        tournament.bracket.forEach(round => {
            const roundSection = document.createElement('div');
            roundSection.className = 'round-section';
            const roundTitle = document.createElement('h4');
            roundTitle.textContent = round.name;
            const matchList = document.createElement('ul');
            matchList.className = 'round-match-list';

            round.matches.forEach(match => {
                const matchItem = document.createElement('li');
                matchItem.className = 'round-match-item';
                const homeScore = typeof match.scoreHome === 'number' ? match.scoreHome : '-';
                const awayScore = typeof match.scoreAway === 'number' ? match.scoreAway : '-';
                let homeWinner = '';
                let awayWinner = '';
                if (typeof match.scoreHome === 'number' && typeof match.scoreAway === 'number') {
                    if (match.scoreHome > match.scoreAway) homeWinner = 'match-winner';
                    else if (match.scoreAway > match.scoreHome) awayWinner = 'match-winner';
                }
                matchItem.innerHTML = `
                    <div class="match-row">
                        <div class="team team-home ${homeWinner}">${renderTeamLabel(match.home, tournament)}</div>
                        <div class="score"><span class="score-pill">${homeScore}</span><span class="score-sep">-</span><span class="score-pill">${awayScore}</span></div>
                        <div class="team team-away ${awayWinner}">${renderTeamLabel(match.away, tournament)}</div>
                    </div>
                `;
                if (match.events?.length) {
                    const eventList = document.createElement('ul');
                    eventList.className = 'event-list';
                    match.events.forEach(event => {
                        const eventItem = document.createElement('li');
                        eventItem.innerHTML = `<span class="event-time">${event.time}</span> <span class="event-desc">${event.description}</span>`;
                        eventList.appendChild(eventItem);
                    });
                    matchItem.appendChild(eventList);
                }
                matchList.appendChild(matchItem);
            });

            roundSection.appendChild(roundTitle);
            roundSection.appendChild(matchList);
            details.appendChild(roundSection);
        });

        container.appendChild(details);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'summary-placeholder';
        placeholder.textContent = 'Aucun match généré. Créez ou suivez le tournoi pour voir le calendrier et les événements.';
        container.appendChild(placeholder);
    }

    return container;
}

function showSummaryModal(tournament) {
    if (!summaryModalContent) return;
    summaryModalContent.innerHTML = '';
    summaryModalContent.appendChild(buildTournamentSummary(tournament));
    showModal('summaryModal');
}

function createDefaultPlayers(teamName) {
    return Array.from({ length: 16 }, (_, index) => ({
        name: `${teamName} joueur ${index + 1}`,
        role: index < 11 ? 'Titulaire' : 'Remplaçant',
        position: index < 11 ? 'Titulaire' : 'Remplaçant',
        goals: 0,
        assists: 0,
        yellow: 0,
        red: 0,
    }));
}

function ensureMatchPlayers(match, tournament) {
    if (!match.homePlayers || !match.homePlayers.length) {
        match.homePlayers = (tournament?.teamPlayers?.[match.home] || []).map(player => ({ ...player })) || createDefaultPlayers(match.home);
    }
    if (!match.awayPlayers || !match.awayPlayers.length) {
        match.awayPlayers = (tournament?.teamPlayers?.[match.away] || []).map(player => ({ ...player })) || createDefaultPlayers(match.away);
    }
}

function syncTournamentRosterStats(tournament, teamName, players) {
    if (!tournament) return;
    if (!tournament.teamPlayers) tournament.teamPlayers = {};
    tournament.teamPlayers[teamName] = players.map(player => ({
        name: player.name || 'Joueur',
        position: player.position || 'Joueur',
        role: player.role || 'Équipier',
        goals: Number(player.goals) || 0,
        assists: Number(player.assists) || 0,
        yellow: Number(player.yellow) || 0,
        red: Number(player.red) || 0,
    }));
}

function buildPlayerTable(players, teamType) {
    return `
        <table class="player-stats-table">
            <thead>
                <tr>
                    <th>Joueur</th>
                    <th>Rôle</th>
                    <th>Buts</th>
                    <th>Passes</th>
                    <th>Jaune</th>
                    <th>Rouge</th>
                </tr>
            </thead>
            <tbody>
                ${players.map((player, index) => `
                    <tr data-team="${teamType}" data-index="${index}">
                        <td><input type="text" class="player-name" value="${player.name}" /></td>
                        <td>${player.role}</td>
                        <td><input type="number" min="0" class="player-goals" value="${player.goals}" /></td>
                        <td><input type="number" min="0" class="player-assists" value="${player.assists}" /></td>
                        <td><input type="number" min="0" class="player-yellow" value="${player.yellow}" /></td>
                        <td><input type="number" min="0" class="player-red" value="${player.red}" /></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function populateManualPlayers(match, tournament) {
    ensureMatchPlayers(match, tournament);
    if (manualPlayersHomeContainer) {
        manualPlayersHomeContainer.innerHTML = buildPlayerTable(match.homePlayers, 'home');
    }
    if (manualPlayersAwayContainer) {
        manualPlayersAwayContainer.innerHTML = buildPlayerTable(match.awayPlayers, 'away');
    }
}

function openManualScoreModal(match, tournament) {
    currentManualMatch = match;
    currentManualTournament = normalizeTournamentGroupStructure(tournament);
    if (currentManualTournament?.id && Array.isArray(currentManualTournament.groups)) {
        currentManualTournament = normalizeTournamentGroupStructure(currentManualTournament);
    }

    if (!manualScoreModal || !manualScoreForm) {
        showNotification('Le modal de suivi n’est pas encore prêt.', 'error');
        return;
    }

    if (!currentManualTournament?.id) {
        showNotification('Le tournoi courant est introuvable.', 'error');
        return;
    }

    const homeTitle = document.getElementById('homeTeamTitle');
    const awayTitle = document.getElementById('awayTeamTitle');
    const finalHomeLabel = document.getElementById('finalHomeLabel');
    const finalAwayLabel = document.getElementById('finalAwayLabel');

    if (manualScoreInfo) manualScoreInfo.textContent = `${match.home} vs ${match.away}`;
    if (homeTitle) homeTitle.textContent = match.home;
    if (awayTitle) awayTitle.textContent = match.away;
    if (finalHomeLabel) finalHomeLabel.textContent = match.home;
    if (finalAwayLabel) finalAwayLabel.textContent = match.away;
    if (manualScoreHome) manualScoreHome.value = typeof match.scoreHome === 'number' ? match.scoreHome : '';
    if (manualScoreAway) manualScoreAway.value = typeof match.scoreAway === 'number' ? match.scoreAway : '';
    if (manualPenaltyHome) manualPenaltyHome.value = typeof match.penaltiesHome === 'number' ? match.penaltiesHome : '';
    if (manualPenaltyAway) manualPenaltyAway.value = typeof match.penaltiesAway === 'number' ? match.penaltiesAway : '';

    // forfeit checkbox: reflect match state and toggle inputs
    if (manualBothForfeit) {
        manualBothForfeit.checked = !!(match.forfeitBoth || match.forfeit);
        const toggleInputs = () => {
            const checked = manualBothForfeit.checked;
            if (manualScoreHome) manualScoreHome.disabled = checked;
            if (manualScoreAway) manualScoreAway.disabled = checked;
            if (manualPenaltyHome) manualPenaltyHome.disabled = checked;
            if (manualPenaltyAway) manualPenaltyAway.disabled = checked;
        };
        manualBothForfeit.addEventListener('change', toggleInputs);
        toggleInputs();
    }

    populateManualPlayers(match, tournament);
    showModal('manualScoreModal');
}

async function handleManualScoreFormSubmit(event) {
    event.preventDefault();
    if (!currentManualMatch || !currentManualTournament) return;

    try {
        currentManualTournament = normalizeTournamentGroupStructure(currentManualTournament);
        const targetMatch = currentManualMatch;
        const isBothForfeit = !!(manualBothForfeit && manualBothForfeit.checked);

        let homeValue = null;
        let awayValue = null;
        let penaltyHomeValue = null;
        let penaltyAwayValue = null;

        if (!isBothForfeit) {
            homeValue = Number(manualScoreHome?.value ?? 0);
            awayValue = Number(manualScoreAway?.value ?? 0);
            penaltyHomeValue = manualPenaltyHome?.value === '' ? null : Number(manualPenaltyHome?.value ?? 0);
            penaltyAwayValue = manualPenaltyAway?.value === '' ? null : Number(manualPenaltyAway?.value ?? 0);
            if (Number.isNaN(homeValue) || Number.isNaN(awayValue) || homeValue < 0 || awayValue < 0) {
                showNotification('Veuillez saisir des scores valides.', 'error');
                return;
            }
            if ((penaltyHomeValue != null && Number.isNaN(penaltyHomeValue)) || (penaltyAwayValue != null && Number.isNaN(penaltyAwayValue))) {
                showNotification('Veuillez saisir des tirs au but valides.', 'error');
                return;
            }
        }

        if (!Array.isArray(currentManualMatch.homePlayers)) {
            currentManualMatch.homePlayers = [];
        }
        if (!Array.isArray(currentManualMatch.awayPlayers)) {
            currentManualMatch.awayPlayers = [];
        }

        const rows = manualScoreForm?.querySelectorAll('tbody tr') || [];
        rows.forEach(row => {
            const teamType = row.dataset.team;
            const index = Number(row.dataset.index);
            const nameInput = row.querySelector('.player-name');
            const goalsInput = row.querySelector('.player-goals');
            const assistsInput = row.querySelector('.player-assists');
            const yellowInput = row.querySelector('.player-yellow');
            const redInput = row.querySelector('.player-red');
            const playerStats = {
                name: nameInput?.value.trim() || `Joueur ${index + 1}`,
                goals: Number(goalsInput?.value) || 0,
                assists: Number(assistsInput?.value) || 0,
                yellow: Number(yellowInput?.value) || 0,
                red: Number(redInput?.value) || 0,
            };
            if (teamType === 'home') {
                currentManualMatch.homePlayers[index] = playerStats;
            } else {
                currentManualMatch.awayPlayers[index] = playerStats;
            }
        });

        if (Array.isArray(currentManualMatch.homePlayers) && currentManualMatch.homePlayers.length) {
            syncTournamentRosterStats(currentManualTournament, currentManualMatch.home, currentManualMatch.homePlayers);
        }
        if (Array.isArray(currentManualMatch.awayPlayers) && currentManualMatch.awayPlayers.length) {
            syncTournamentRosterStats(currentManualTournament, currentManualMatch.away, currentManualMatch.awayPlayers);
        }

        if (isBothForfeit) {
            targetMatch.scoreHome = null;
            targetMatch.scoreAway = null;
            targetMatch.penaltiesHome = null;
            targetMatch.penaltiesAway = null;
            targetMatch.forfeit = true;
            targetMatch.forfeitBoth = true;
            targetMatch.events = [{ time: '-', description: 'Forfait, les deux équipes ont déclaré forfait' }];
        } else {
            targetMatch.scoreHome = homeValue;
            targetMatch.scoreAway = awayValue;
            targetMatch.penaltiesHome = penaltyHomeValue;
            targetMatch.penaltiesAway = penaltyAwayValue;
            targetMatch.events = createMatchEvents(targetMatch);
        }

        if (currentManualTournament.type === 'Knockout') {
            advanceKnockoutBracket(currentManualTournament.bracket);
        }
        if (currentManualTournament.type === 'GroupKnockout') {
            const groups = currentManualTournament.groups || [];
            groups.forEach(group => {
                const standings = computeStandings(group.teams);
                group.matches.forEach(match => applyResultsToStandings(standings, match));
                group.standings = sortStandings(standings);
            });
            const groupStageComplete = groups.every(group => group.matches.every(match => match.scoreHome != null && match.scoreAway != null));
            const shouldInitializeBracket = groupStageComplete && (!Array.isArray(currentManualTournament.bracket) || currentManualTournament.bracket.length === 0 || currentManualTournament.bracket.every(round => (round.matches || []).every(match => {
                const isPlaceholderTeam = (value) => typeof value === 'string' && /^(1er|1ère|2e|2ème)/i.test(value);
                return (!match.scoreHome && !match.scoreAway) && (isPlaceholderTeam(match.home) || isPlaceholderTeam(match.away) || match.home === 'TBD' || match.away === 'TBD' || match.home === 'BYE' || match.away === 'BYE');
            })));
            if (shouldInitializeBracket) {
                currentManualTournament.bracket = buildGroupBracket(groups);
            } else if (!groupStageComplete && (!Array.isArray(currentManualTournament.bracket) || !currentManualTournament.bracket.length)) {
                currentManualTournament.bracket = buildKnockoutBracket(buildPlaceholderQualifierSlots(groups));
            }
            if (currentManualTournament.bracket?.length) {
                advanceKnockoutBracket(currentManualTournament.bracket);
            }
        }

        refreshTournamentStandings(currentManualTournament);
        finalizeTournamentState(currentManualTournament);

        if (selectedTournament?.id === currentManualTournament.id) {
            Object.assign(selectedTournament, currentManualTournament);
        }

        await saveTournament(currentManualTournament);
        const reloaded = await loadTournaments();
        const updated = reloaded.find(item => item.id === currentManualTournament.id);
        if (updated) {
            Object.assign(currentManualTournament, updated);
            selectedTournament = currentManualTournament;
        }
        await refreshList();
        if (selectedTournament) {
            setActiveTab('matchs');
        }
        hideModal('manualScoreModal');
        if (targetMatch.forfeitBoth) {
            showNotification(`Forfait enregistré pour ${targetMatch.home} vs ${targetMatch.away}.`, 'success');
        } else {
            showNotification(`Résultat enregistré : ${targetMatch.home} ${targetMatch.scoreHome}-${targetMatch.scoreAway} ${targetMatch.away}.`, 'success');
        }
    } catch (error) {
        console.error('Erreur lors de l’enregistrement du match.', error);
        showNotification('Une erreur est survenue pendant l’enregistrement. Le tournoi reste utilisable.', 'error');
    }
}

function getProgressStages(tournament) {
    const stages = [];
    // Championship: count matches played vs total -> show journées
    if (tournament.type === 'Championship') {
        const matches = tournament.bracket?.[0]?.matches || [];
        const played = matches.filter(m => m.scoreHome != null && m.scoreAway != null).length;
        const total = matches.length;
        stages.push({ key: 'journee', label: `Journées jouées ${played} / ${total}`, status: played === total ? 'completed' : played > 0 ? 'in-progress' : 'pending' });
        return stages;
    }

    // Group + Knockout: phase de groupe puis rounds
    if (tournament.type === 'GroupKnockout') {
        // phase de groupe
        const groups = tournament.groups || [];
        const groupPlayed = groups.reduce((acc, g) => acc + (g.matches?.filter(m => m.scoreHome != null && m.scoreAway != null).length || 0), 0);
        const groupTotal = groups.reduce((acc, g) => acc + (g.matches?.length || 0), 0);
        stages.push({ key: 'group', label: `Phase de groupe ${groupPlayed} / ${groupTotal}`, status: groupPlayed === groupTotal && groupTotal > 0 ? 'completed' : groupPlayed > 0 ? 'in-progress' : 'pending' });
        // fallthrough to knockout bracket
    }

    // Knockout-like brackets
    const rounds = tournament.bracket || [];
    // iterate from first (largest) to last (final)
    rounds.forEach((round, idx) => {
        const matches = round.matches || [];
        const played = matches.filter(m => m.scoreHome != null && m.scoreAway != null).length;
        const total = matches.length;
        let label = round.name || `${total * 2} équipes`;
        // normalize common labels
        if (total === 1) label = 'Finale';
        else if (total === 2) label = 'Demi-finales';
        else if (total === 4) label = 'Quarts de finale (8)';
        else if (total === 8) label = 'Huitièmes de finale (16)';
        else if (total === 16) label = 'Seizièmes de finale (32)';
        const status = played === total && total > 0 ? 'completed' : played > 0 ? 'in-progress' : 'pending';
        stages.push({ key: `round_${idx}`, label, status });
    });

    return stages;
}

function computeProgressPercent(stages) {
    if (!stages || !stages.length) return 0;
    const completed = stages.filter(s => s.status === 'completed').length;
    const inprogress = stages.filter(s => s.status === 'in-progress').length;
    const total = stages.length;
    const ratio = (completed + inprogress * 0.5) / total;
    return Math.round(ratio * 100);
}

function showSummaryView() {
    summaryContent?.classList.remove('hidden');
    dashboardShell?.classList.add('hidden');
}

function showDashboardView() {
    summaryContent?.classList.add('hidden');
    dashboardShell?.classList.remove('hidden');
}

function setActiveTab(tabName) {
    tabButtons.forEach(button => button.classList.toggle('active', button.dataset.tab === tabName));
    if (!selectedTournament) return;
    switch (tabName) {
        case 'overview': renderDashboardOverview(selectedTournament); break;
        case 'matchs': renderDashboardSchedule(selectedTournament); break;
        case 'classement': renderDashboardStandings(selectedTournament); break;
        case 'buteur': renderTopScorers(selectedTournament); break;
        case 'passeur': renderTopAssists(selectedTournament); break;
        case 'summary': renderTournamentSummaryTab(selectedTournament); break;
        case 'press': renderPress(selectedTournament); break;
        default: renderDashboardOverview(selectedTournament);
    }
}

function renderDashboardOverview(tournament) {
    const body = document.createElement('div');
    body.className = 'dashboard-card';
    body.innerHTML = `
    <h3>Tableau de bord</h3>
    <p><strong>Tournoi :</strong> ${tournament.name}</p>
    <p><strong>Type :</strong> ${tournament.type}</p>
    <p><strong>Statut :</strong> ${tournament.status}</p>
    <p><strong>Équipes :</strong> ${tournament.teams.length}</p>
    <p><strong>Méthode :</strong> ${tournament.drawMethod || 'Aléatoire'}</p>
    <p><strong>Champion :</strong> ${tournament.champion || 'En attente'}</p>
  `;
    dashboardBody.innerHTML = '';
    dashboardBody.appendChild(body);
}

function buildMatchActionButton(match, tournament) {
    const finished = typeof match.scoreHome === 'number' && typeof match.scoreAway === 'number';
    const isForfeit = !!match.forfeitBoth || !!match.forfeit;
    const homeName = String(match.home || '').trim();
    const awayName = String(match.away || '').trim();
    const hasPlayableTeams = Boolean(homeName && homeName !== 'TBD' && homeName !== 'BYE' && awayName && awayName !== 'TBD' && awayName !== 'BYE');

    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    if (isForfeit) {
        actionButton.className = 'match-action-button forfeited';
        actionButton.textContent = 'Forfait';
        actionButton.disabled = true;
    } else {
        actionButton.className = finished ? 'match-action-button finished' : 'match-action-button live';
        actionButton.textContent = finished ? 'Terminé' : 'En direct';
        actionButton.disabled = !hasPlayableTeams;
        actionButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (!hasPlayableTeams) {
                showNotification('Ce match n’a pas encore d’équipes valides pour être suivi.', 'error');
                return;
            }
            openManualScoreModal(match, tournament);
        });
    }
    return actionButton;
}

function renderDashboardSchedule(tournament) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<h3>Calendrier</h3>';

    const displayTournament = normalizeTournamentGroupStructure(tournament);

    if (displayTournament.type === 'GroupKnockout' && displayTournament.groups?.length) {
        const groupSummary = document.createElement('div');
        groupSummary.className = 'round-section';
        groupSummary.innerHTML = '<div class="round-section__header"><h4>Phase de groupes</h4><span class="round-section__counter">Qualifications</span></div>';

        const summaryList = document.createElement('div');
        summaryList.className = 'group-summary-list';

        displayTournament.groups.forEach(group => {
            const standings = Array.isArray(group.standings) && group.standings.length
                ? group.standings
                : (() => {
                    const computed = computeStandings(group.teams);
                    (group.matches || []).forEach(match => applyResultsToStandings(computed, match));
                    return sortStandings(computed).map((row, index, arr) => ({ ...row, badge: getBadgeForPosition(index, arr.length, 'GroupKnockout') }));
                })();

            const qualifiers = standings.slice(0, 2).map(row => row.team).filter(Boolean);
            const card = document.createElement('div');
            card.className = 'group-summary-card';
            card.innerHTML = `
                <div class="group-summary-card__header">
                    <strong>${escapeHtml(group.name)}</strong>
                    <span class="group-pill">Qualifiés</span>
                </div>
                <div class="group-summary-card__teams">
                    ${qualifiers.map(team => `<span class="qualifier-team">${escapeHtml(team)}</span>`).join('')}
                </div>
            `;
            summaryList.appendChild(card);
        });

        groupSummary.appendChild(summaryList);
        wrapper.appendChild(groupSummary);

        const groupedByDay = new Map();
        displayTournament.groups.forEach(group => {
            (group.rounds || []).forEach(round => {
                const dayKey = round.name;
                if (!groupedByDay.has(dayKey)) groupedByDay.set(dayKey, []);
                (round.matches || []).forEach(match => {
                    match.groupName = group.name;
                    groupedByDay.get(dayKey).push(match);
                });
            });
        });

        groupedByDay.forEach((matches, dayName) => {
            const section = document.createElement('div');
            section.className = 'round-section';
            const header = document.createElement('div');
            header.className = 'round-section__header';
            const title = document.createElement('h4');
            title.textContent = dayName;
            const counter = document.createElement('span');
            counter.className = 'round-section__counter';
            counter.textContent = `${matches.length} match${matches.length > 1 ? 's' : ''}`;
            header.append(title, counter);
            const list = document.createElement('ul');
            list.className = 'round-match-list';
            matches.forEach(match => {
                const item = document.createElement('li');
                const matchRow = document.createElement('div');
                matchRow.className = 'match-row';
                const homeScore = typeof match.scoreHome === 'number' ? match.scoreHome : '-';
                const awayScore = typeof match.scoreAway === 'number' ? match.scoreAway : '-';
                let homeWinner = '';
                let awayWinner = '';
                const finished = typeof match.scoreHome === 'number' && typeof match.scoreAway === 'number';
                if (finished) {
                    if (match.scoreHome > match.scoreAway) homeWinner = 'match-winner';
                    else if (match.scoreAway > match.scoreHome) awayWinner = 'match-winner';
                }

                const homeTeam = document.createElement('div');
                homeTeam.className = `team team-home ${homeWinner}`;
                homeTeam.innerHTML = renderTeamLabel(match.home, displayTournament);

                const scoreBox = document.createElement('div');
                scoreBox.className = 'score';
                scoreBox.innerHTML = `<span class="score-pill">${homeScore}</span><span class="score-sep">-</span><span class="score-pill">${awayScore}</span>`;

                const awayTeam = document.createElement('div');
                awayTeam.className = `team team-away ${awayWinner}`;
                awayTeam.innerHTML = renderTeamLabel(match.away, displayTournament);

                const meta = document.createElement('div');
                meta.className = 'match-meta';
                meta.textContent = `${match.groupName} • ${match.roundName || dayName}`;

                const actionButton = buildMatchActionButton(match, displayTournament);

                matchRow.append(homeTeam, scoreBox, awayTeam, meta, actionButton);
                item.appendChild(matchRow);
                list.appendChild(item);
            });
            section.appendChild(header);
            section.appendChild(list);
            wrapper.appendChild(section);
        });
    }

    if (displayTournament.bracket?.length) {
        displayTournament.bracket.forEach(round => {
            const section = document.createElement('div');
            section.className = 'round-section';
            const header = document.createElement('div');
            header.className = 'round-section__header';
            const title = document.createElement('h4');
            title.textContent = round.name;
            const counter = document.createElement('span');
            counter.className = 'round-section__counter';
            counter.textContent = `${round.matches?.length || 0} match${(round.matches?.length || 0) > 1 ? 's' : ''}`;
            header.append(title, counter);
            const list = document.createElement('ul');
            list.className = 'round-match-list';
            round.matches.forEach(match => {
                const item = document.createElement('li');
                const matchRow = document.createElement('div');
                matchRow.className = 'match-row';
                const homeScore = typeof match.scoreHome === 'number' ? match.scoreHome : '-';
                const awayScore = typeof match.scoreAway === 'number' ? match.scoreAway : '-';
                let homeWinner = '';
                let awayWinner = '';
                const finished = typeof match.scoreHome === 'number' && typeof match.scoreAway === 'number';
                if (finished) {
                    if (match.scoreHome > match.scoreAway) homeWinner = 'match-winner';
                    else if (match.scoreAway > match.scoreHome) awayWinner = 'match-winner';
                }

                const homeTeam = document.createElement('div');
                homeTeam.className = `team team-home ${homeWinner}`;
                homeTeam.innerHTML = renderTeamLabel(match.home, displayTournament);

                const scoreBox = document.createElement('div');
                scoreBox.className = 'score';
                scoreBox.innerHTML = `<span class="score-pill">${homeScore}</span><span class="score-sep">-</span><span class="score-pill">${awayScore}</span>`;

                const awayTeam = document.createElement('div');
                awayTeam.className = `team team-away ${awayWinner}`;
                awayTeam.innerHTML = renderTeamLabel(match.away, displayTournament);

                const actionButton = buildMatchActionButton(match, displayTournament);

                matchRow.append(homeTeam, scoreBox, awayTeam, actionButton);
                item.appendChild(matchRow);
                list.appendChild(item);
            });
            section.appendChild(header);
            section.appendChild(list);
            wrapper.appendChild(section);
        });
    } else {
        wrapper.innerHTML += '<p>Aucun calendrier disponible.</p>';
    }
    dashboardBody.innerHTML = '';
    dashboardBody.appendChild(wrapper);
}

function getTeamDisciplinaryStats(tournament, teamName) {
    const roster = tournament?.teamPlayers?.[teamName] || [];
    return roster.reduce((stats, player) => {
        stats.yellow += Number(player?.yellow) || 0;
        stats.red += Number(player?.red) || 0;
        return stats;
    }, { yellow: 0, red: 0 });
}

function renderDashboardStandings(tournament) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<h3>Classement</h3>';

    if (tournament.type === 'GroupKnockout' && tournament.groups?.length) {
        tournament.groups.forEach(group => {
            const groupSection = document.createElement('div');
            groupSection.className = 'group-section';
            groupSection.innerHTML = `<h4>${escapeHtml(group.name)}</h4>`;
            let standings = group.standings;
            if (!standings?.length) {
                const computed = computeStandings(group.teams);
                group.matches.forEach(match => applyResultsToStandings(computed, match));
                standings = sortStandings(computed).map((row, index, arr) => ({ ...row, badge: getBadgeForPosition(index, arr.length, 'GroupKnockout') }));
            }
            const table = document.createElement('table');
            table.className = 'dashboard-table';
            table.innerHTML = `
                <thead><tr><th>#</th><th>Équipe</th><th>Pts</th><th>Diff</th><th>J</th><th>🟨</th><th>🟥</th></tr></thead>
                <tbody>${standings.map((row, index) => {
                const badge = row.badge || getBadgeForPosition(index, standings.length, 'GroupKnockout');
                const tag = index < 2 ? '<span class="standing-tag standing-tag--qualified">Qualifié</span>' : index >= standings.length - 2 ? '<span class="standing-tag standing-tag--eliminated">Éliminé</span>' : '<span class="standing-tag standing-tag--middle">À suivre</span>';
                const cards = getTeamDisciplinaryStats(tournament, row.team);
                return `<tr class="${badge}"><td>${index + 1}</td><td>${renderTeamLabel(row.team, tournament)} ${tag}</td><td>${row.points}</td><td>${row.goalDiff}</td><td>${row.played}</td><td>${cards.yellow}</td><td>${cards.red}</td></tr>`;
            }).join('')}</tbody>
            `;
            groupSection.appendChild(table);
            wrapper.appendChild(groupSection);
        });
    }

    if (!tournament.type || tournament.type !== 'GroupKnockout') {
        if (tournament.table?.length) {
            const overallSection = document.createElement('div');
            overallSection.className = 'group-section';
            overallSection.innerHTML = '<h4>Classement général</h4>';
            const table = document.createElement('table');
            table.className = 'dashboard-table';
            table.innerHTML = `
                <thead><tr><th>#</th><th>Équipe</th><th>Pts</th><th>Diff</th><th>J</th><th>🟨</th><th>🟥</th></tr></thead>
                <tbody>${tournament.table.map((row, index) => {
                const cards = getTeamDisciplinaryStats(tournament, row.team);
                return `<tr class="${row.badge || ''}"><td>${index + 1}</td><td>${renderTeamLabel(row.team, tournament)}</td><td>${row.points}</td><td>${row.goalDiff}</td><td>${row.played}</td><td>${cards.yellow}</td><td>${cards.red}</td></tr>`;
            }).join('')}</tbody>
            `;
            overallSection.appendChild(table);
            wrapper.appendChild(overallSection);
        } else {
            wrapper.innerHTML += '<p>Aucun classement disponible.</p>';
        }
    }
    dashboardBody.innerHTML = '';
    dashboardBody.appendChild(wrapper);
}

function renderTopScorers(tournament) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<h3>Meilleurs buteurs</h3>';

    const players = [];
    const teamPlayers = tournament.teamPlayers || {};

    Object.entries(teamPlayers).forEach(([teamName, roster]) => {
        (roster || []).forEach(player => {
            if (Number(player.goals) > 0) {
                players.push({
                    name: player.name || 'Joueur',
                    team: teamName,
                    goals: Number(player.goals) || 0,
                });
            }
        });
    });

    const sorted = players.sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));

    if (!sorted.length) {
        wrapper.innerHTML += '<p>Aucun buteur n’a encore été enregistré pour ce tournoi.</p>';
        dashboardBody.innerHTML = '';
        dashboardBody.appendChild(wrapper);
        return;
    }

    const table = document.createElement('table');
    table.className = 'dashboard-table';
    table.innerHTML = `
        <thead>
            <tr><th>Joueur</th><th>Équipe</th><th>But(s)</th></tr>
        </thead>
        <tbody>
            ${sorted.map(player => `
                <tr>
                    <td>${escapeHtml(player.name)}</td>
                    <td>${renderTeamLabel(player.team, tournament)}</td>
                    <td>${player.goals}</td>
                </tr>
            `).join('')}
        </tbody>
    `;
    wrapper.appendChild(table);
    dashboardBody.innerHTML = '';
    dashboardBody.appendChild(wrapper);
}

function renderTopAssists(tournament) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<h3>Meilleurs passeurs</h3>';

    const players = [];
    const teamPlayers = tournament.teamPlayers || {};

    Object.entries(teamPlayers).forEach(([teamName, roster]) => {
        (roster || []).forEach(player => {
            if (Number(player.assists) > 0) {
                players.push({
                    name: player.name || 'Joueur',
                    team: teamName,
                    assists: Number(player.assists) || 0,
                });
            }
        });
    });

    const sorted = players.sort((a, b) => b.assists - a.assists || a.name.localeCompare(b.name));

    if (!sorted.length) {
        wrapper.innerHTML += '<p>Aucun passeur n’a encore été enregistré pour ce tournoi.</p>';
        dashboardBody.innerHTML = '';
        dashboardBody.appendChild(wrapper);
        return;
    }

    const table = document.createElement('table');
    table.className = 'dashboard-table';
    table.innerHTML = `
        <thead>
            <tr><th>Joueur</th><th>Équipe</th><th>Passes</th></tr>
        </thead>
        <tbody>
            ${sorted.map(player => `
                <tr>
                    <td>${escapeHtml(player.name)}</td>
                    <td>${renderTeamLabel(player.team, tournament)}</td>
                    <td>${player.assists}</td>
                </tr>
            `).join('')}
        </tbody>
    `;
    wrapper.appendChild(table);
    dashboardBody.innerHTML = '';
    dashboardBody.appendChild(wrapper);
}

function renderTournamentSummaryTab(tournament) {
    const wrapper = document.createElement('div');
    wrapper.className = 'dashboard-card';
    wrapper.appendChild(buildTournamentSummary(tournament));
    dashboardBody.innerHTML = '';
    dashboardBody.appendChild(wrapper);
}

function renderPress(tournament) {
    const wrapper = document.createElement('div');
    wrapper.className = 'press-card';
    wrapper.innerHTML = '<h3>Press & Actu</h3>';

    const matches = tournament.bracket?.flatMap(round => (round.matches || []).map(match => ({ ...match, round: round.name }))) || [];
    const playedMatches = matches.filter(m => typeof m.scoreHome === 'number' && typeof m.scoreAway === 'number');
    const upcomingMatches = matches.filter(m => m.scoreHome == null || m.scoreAway == null);

    const newsItems = [];
    if (tournament.status === 'Terminé' && tournament.champion) {
        newsItems.push({
            title: `Champion confirmé : ${tournament.champion}`,
            detail: `Le tournoi ${tournament.name} est terminé et ${tournament.champion} remporte le trophée.`
        });
    }

    if (playedMatches.length) {
        const latest = playedMatches[playedMatches.length - 1];
        newsItems.push({
            title: `Dernier résultat : ${latest.home} ${latest.scoreHome}-${latest.scoreAway} ${latest.away}`,
            detail: `Match joué en ${latest.round}. ${latest.home} s'impose ${latest.scoreHome}-${latest.scoreAway}.`
        });
    }

    if (upcomingMatches.length) {
        const nextMatch = upcomingMatches[0];
        newsItems.push({
            title: `À venir : ${nextMatch.home} vs ${nextMatch.away}`,
            detail: `Prochain match en ${nextMatch.round} pour le tournoi ${tournament.name}.`
        });
    }

    const goals = new Map();
    playedMatches.forEach(match => {
        goals.set(match.home, (goals.get(match.home) || 0) + (match.scoreHome || 0));
        goals.set(match.away, (goals.get(match.away) || 0) + (match.scoreAway || 0));
    });
    const bestTeam = Array.from(goals.entries()).sort((a, b) => b[1] - a[1])[0];
    if (bestTeam) {
        newsItems.push({
            title: `Équipe en forme : ${bestTeam[0]}`,
            detail: `${bestTeam[0]} a marqué ${bestTeam[1]} but(s) et domine les statistiques du tournoi.`
        });
    }

    // add a few event-driven headlines
    const eventHeadlines = [];
    playedMatches.forEach(match => {
        (match.events || []).slice(0, 3).forEach(event => {
            eventHeadlines.push({
                title: `${match.home} vs ${match.away} - ${event.time}`,
                detail: event.description
            });
        });
    });
    eventHeadlines.slice(0, 4).forEach(item => newsItems.push(item));

    if (!newsItems.length) {
        wrapper.innerHTML += '<p>Aucune actualité pour le moment.</p>';
    } else {
        const feed = document.createElement('div');
        feed.className = 'press-feed';
        newsItems.forEach(item => {
            const node = document.createElement('article');
            node.className = 'press-item';
            node.innerHTML = `
                <div class="press-item-title">${item.title}</div>
                <div class="press-item-detail">${item.detail}</div>
            `;
            feed.appendChild(node);
        });
        wrapper.appendChild(feed);
    }

    dashboardBody.innerHTML = '';
    dashboardBody.appendChild(wrapper);
}

function renderDashboardEvents(tournament) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<h3>Événements</h3>';
    const events = [];
    tournament.bracket?.forEach(round => {
        round.matches.forEach(match => {
            (match.events || []).forEach(event => {
                events.push({ time: event.time, description: event.description, match: `${match.home} vs ${match.away}` });
            });
        });
    });
    if (!events.length) {
        wrapper.innerHTML += '<p>Aucun événement enregistré.</p>';
        dashboardBody.innerHTML = '';
        dashboardBody.appendChild(wrapper);
        return;
    }
    const list = document.createElement('ul');
    list.className = 'event-list';
    events.sort((a, b) => parseInt(a.time, 10) - parseInt(b.time, 10)).forEach(event => {
        const item = document.createElement('li');
        item.textContent = `${event.time} - ${event.match} : ${event.description}`;
        list.appendChild(item);
    });
    wrapper.appendChild(list);
    dashboardBody.innerHTML = '';
    dashboardBody.appendChild(wrapper);
}

async function followTournament(tournament) {
    selectedTournament = tournament;
    showModal('followModal');
    setActiveTab('overview');
    if (tournament.status === 'Terminé') {
        showFinalCelebration(tournament);
        showNotification(`Tournoi ${tournament.name} déjà terminé.`);
        return;
    }
    refreshTournamentStandings(tournament);
    tournament.status = 'En cours';
    await saveTournament(tournament);
    await refreshList();
    showNotification(`Mode manuel activé pour ${tournament.name}. Saisissez les scores match par match.`);
}

function validateTeams(teams) {
    const unique = new Set(teams.map(team => team.toLowerCase()));
    return teams.length >= 4 && unique.size === teams.length;
}

function createTournamentData(values) {
    const id = `${Date.now()}-${createSlug(values.name)}`;
    const teamRows = Array.from(tournamentForm.querySelectorAll('.team-row'));
    const teamNames = [];
    const teamLogos = {};
    const teamPlayers = {};

    teamRows.forEach(row => {
        const nameInput = row.querySelector('.team-name');
        const logoInput = row.querySelector('.team-logo');
        const rosterInput = row.querySelector('.team-roster');
        const name = nameInput?.value.trim() || `Équipe ${nameInput?.dataset.index || teamNames.length + 1}`;
        if (!name) return;
        teamNames.push(name);
        const customLogo = logoInput?.value.trim();
        teamLogos[name] = customLogo || buildAutoTeamLogo(name);

        const rosterText = rosterInput?.value.trim() || '';
        const roster = rosterText
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const parts = line.split('|').map(part => part.trim());
                const [fullName, position = 'Joueur', role = 'Équipier'] = parts;
                return {
                    name: fullName || 'Joueur',
                    position: position || 'Joueur',
                    role: role || 'Équipier',
                    goals: 0,
                    assists: 0,
                    yellow: 0,
                    red: 0,
                };
            });

        teamPlayers[name] = roster.length ? roster : [
            { name: `${name} capitaine`, position: 'Capitaine', role: 'Leader', goals: 0, assists: 0, yellow: 0, red: 0 },
            { name: `${name} gardien`, position: 'Gardien', role: 'Gardien', goals: 0, assists: 0, yellow: 0, red: 0 },
            { name: `${name} attaquant`, position: 'Attaquant', role: 'Attaquant', goals: 0, assists: 0, yellow: 0, red: 0 },
        ];
    });

    const tournament = {
        id,
        name: values.name,
        type: values.type,
        season: values.season,
        drawMethod: values.drawMethod,
        logo: values.logo || buildAutoTournamentLogo(values.name),
        teams: teamNames,
        teamLogos,
        teamPlayers,
        status: 'Ouvert',
        createdAt: new Date().toISOString(),
        bracket: [],
        table: [],
        champion: null,
    };
    createTournamentSchedule(tournament);
    return tournament;
}

function renderTournamentRows(tournaments) {
    tournamentsTable.innerHTML = '';
    tournaments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    tournaments.forEach(tournament => {
        if (statusFilter.value !== 'all') {
            const filterValue = statusFilter.value;
            if (tournament.status !== filterValue && tournament.type !== filterValue) return;
        }
        const row = document.createElement('tr');
        row.innerHTML = `
      <td class="name">${renderTournamentBadge(tournament)}</td>
      <td class="type">${tournament.type}</td>
      <td class="teams">${tournament.teams.length}</td>
      <td class="status"></td>
      <td class="actions"></td>
    `;
        row.querySelector('.status').appendChild(makeStatusBadge(tournament.status));
        const actionsCell = row.querySelector('.actions');

        const viewButton = document.createElement('button');
        viewButton.className = 'secondary';
        viewButton.innerHTML = '<i class="fa-solid fa-eye" aria-hidden="true"></i>';
        viewButton.title = 'Détails';
        viewButton.addEventListener('click', () => {
            showSummaryModal(tournament);
        });

        const exportButton = document.createElement('button');
        exportButton.className = 'secondary';
        exportButton.innerHTML = '<i class="fa-solid fa-file-export" aria-hidden="true"></i>';
        exportButton.title = 'Exporter';
        exportButton.addEventListener('click', async () => {
            tournament.exportLink = await createExportLink(tournament.id, tournament);
            await saveTournament(tournament);
            const json = JSON.stringify(tournament, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${createSlug(tournament.name)}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            showNotification(`Tournoi "${tournament.name}" exporté avec succès.`, 'success');
        });

        const copyButton = document.createElement('button');
        copyButton.className = 'secondary';
        copyButton.innerHTML = '<i class="fa-solid fa-copy" aria-hidden="true"></i>';
        copyButton.title = 'Copier le lien';
        copyButton.addEventListener('click', async () => {
            try {
                await copyTournamentLink(tournament);
                showNotification(`Lien du tournoi "${tournament.name}" copié.`, 'success');
            } catch (error) {
                showNotification(`Impossible de copier le lien : ${error.message}`, 'error');
            }
        });

        const deleteButton = document.createElement('button');
        deleteButton.className = 'secondary danger';
        deleteButton.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
        deleteButton.title = 'Supprimer';
        deleteButton.addEventListener('click', async () => {
            if (!confirm(`Supprimer le tournoi "${tournament.name}" ? Cette action est irréversible.`)) return;
            await deleteTournament(tournament.id);
            await refreshList();
            showNotification(`Tournoi "${tournament.name}" supprimé.`, 'success');
        });

        const simulateButton = document.createElement('button');
        simulateButton.className = 'primary';
        simulateButton.innerHTML = '<i class="fa-solid fa-play" aria-hidden="true"></i>';
        simulateButton.title = 'Suivre';
        simulateButton.addEventListener('click', async () => {
            await followTournament(tournament);
        });

        actionsCell.append(viewButton, exportButton, copyButton, deleteButton, simulateButton);
        tournamentsTable.appendChild(row);
    });
}

async function refreshList() {
    const tournaments = await loadTournaments();
    renderTournamentRows(tournaments);
}

function updateTeamInputs() {
    const count = Number(teamCount.value) || 8;
    teamInputs.innerHTML = '';
    for (let i = 1; i <= count; i += 1) {
        const row = document.createElement('div');
        row.className = 'team-row';
        row.innerHTML = `
            <div class="team-row__main">
                <input type="text" class="team-name" data-index="${i}" placeholder="Nom équipe ${i}" required value="Équipe ${i}" />
                <input type="url" class="team-logo" data-index="${i}" placeholder="Logo URL (optionnel)" />
            </div>
            <textarea class="team-roster" rows="4" placeholder="Nom | Poste | Rôle&#10;Ex: Zidane | Attaquant | Capitaine&#10;Ex: Salah | Gardien | Gardien"></textarea>
        `;
        teamInputs.appendChild(row);
    }
}

function resetForm() {
    tournamentForm.reset();
    updateTeamInputs();
    showNotification('Paramètres du formulaire réinitialisés.', 'info');
}

async function handleSubmit(event) {
    event.preventDefault();
    const values = {
        name: document.getElementById('tournamentName').value.trim(),
        type: tournamentType.value,
        season: document.getElementById('tournamentSeason').value.trim(),
        drawMethod: drawMethod.value,
        logo: document.getElementById('tournamentLogo').value.trim(),
    };
    const teams = Array.from(tournamentForm.querySelectorAll('input.team-name')).map(input => input.value.trim());
    if (!values.name) {
        alert('Veuillez saisir le nom du tournoi.');
        return;
    }
    if (!validateTeams(teams)) {
        alert('Veuillez saisir des noms d\'équipes valides et uniques.');
        return;
    }
    const tournament = createTournamentData(values);
    tournament.teamCount = teams.length;
    await saveTournament(tournament);
    hideModal('tournamentModal');
    await refreshList();
    showNotification(`Tournoi "${tournament.name}" créé avec succès.`, 'success');
}

function attachEventListeners() {
    notificationButton.addEventListener('click', () => {
        showModal('notificationModal');
        renderNotificationList();
        markNotificationsAsViewed();
    });
    resetDbButton.addEventListener('click', resetDatabase);
    openCreateButton.addEventListener('click', () => showModal('tournamentModal'));
    closeButtons.forEach(button => button.addEventListener('click', () => hideModal(button.dataset.close)));
    teamCount.addEventListener('change', updateTeamInputs);
    resetButton.addEventListener('click', resetForm);
    tournamentForm.addEventListener('submit', handleSubmit);
    manualScoreForm.addEventListener('submit', handleManualScoreFormSubmit);
    refreshButton.addEventListener('click', refreshList);
    globalSearch?.addEventListener('input', () => applySearchFilter(globalSearch.value));
    statsButton?.addEventListener('click', async () => {
        if (!selectedTournament) {
            showNotification('Sélectionnez un tournoi à gauche (Détails) puis réessayez.', 'info');
            return;
        }
        await renderStatsForSelected();
        showModal('statsModal');
    });
    exportImgButton?.addEventListener('click', async () => {
        await exportDashboardImage();
    });
    helpButton?.addEventListener('click', () => showHelpTour());
    tabButtons.forEach(button => button.addEventListener('click', () => setActiveTab(button.dataset.tab)));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            Object.keys(modalState).forEach(key => hideModal(key));
        }
    });
}

async function init() {
    modalState = {
        notificationModal: document.getElementById('notificationModal'),
        tournamentModal: document.getElementById('tournamentModal'),
        summaryModal: document.getElementById('summaryModal'),
        followModal: document.getElementById('followModal'),
        manualScoreModal: document.getElementById('manualScoreModal'),
        finalModal: document.getElementById('finalModal'),
        statsModal: document.getElementById('statsModal'),
        helpModal: document.getElementById('helpModal'),
    };
    notificationButton = document.getElementById('notificationButton');
    notificationBadge = document.getElementById('notificationBadge');
    notificationList = document.getElementById('notificationList');
    openCreateButton = document.getElementById('openCreateButton');
    resetDbButton = document.getElementById('resetDbButton');
    toggleButton = document.getElementById('toggleButton');
    closeButtons = document.querySelectorAll('[data-close]');
    teamInputs = document.getElementById('teamInputs');
    teamCount = document.getElementById('teamCount');
    tournamentForm = document.getElementById('tournamentForm');
    resetButton = document.getElementById('resetButton');
    tournamentsTable = document.querySelector('#tournamentsTable tbody');
    globalSearch = document.getElementById('globalSearch');
    statsButton = document.getElementById('statsButton');
    exportImgButton = document.getElementById('exportImgButton');
    helpButton = document.getElementById('helpButton');
    toggleButton?.addEventListener('click', () => {
        const body = document.body;
        if (body.classList.contains('compact-buttons')) {
            body.classList.remove('compact-buttons');
            body.classList.add('labels-visible');
            localStorage.setItem('btnStyle', 'labels');
            toggleButton.innerHTML = '<i class="fa-solid fa-toggle-on" aria-hidden="true"></i><span class="btn-label">Labels</span>';
        } else {
            body.classList.remove('labels-visible');
            body.classList.add('compact-buttons');
            localStorage.setItem('btnStyle', 'compact');
            toggleButton.innerHTML = '<i class="fa-solid fa-toggle-off" aria-hidden="true"></i><span class="btn-label">Compact</span>';
        }
    });
    // apply saved button style
    const saved = localStorage.getItem('btnStyle') || 'labels';
    if (saved === 'compact') document.body.classList.add('compact-buttons');
    else document.body.classList.add('labels-visible');
    // update toggle visual
    if (toggleButton) {
        if (document.body.classList.contains('compact-buttons')) toggleButton.innerHTML = '<i class="fa-solid fa-toggle-off" aria-hidden="true"></i><span class="btn-label">Compact</span>';
        else toggleButton.innerHTML = '<i class="fa-solid fa-toggle-on" aria-hidden="true"></i><span class="btn-label">Labels</span>';
    }
    tournamentType = document.getElementById('tournamentType');
    statusFilter = document.getElementById('statusFilter');
    refreshButton = document.getElementById('refreshButton');
    summaryContent = document.getElementById('summaryContent');
    championText = document.getElementById('championText');
    drawMethod = document.getElementById('drawMethod');
    summaryModalContent = document.getElementById('summaryModalContent');
    dashboardShell = document.getElementById('dashboardShell');
    dashboardBody = document.getElementById('dashboardBody');
    tabButtons = document.querySelectorAll('[data-tab]');
    manualScoreModal = document.getElementById('manualScoreModal');
    manualScoreForm = document.getElementById('manualScoreForm');
    manualScoreHome = document.getElementById('manualScoreHome');
    manualScoreAway = document.getElementById('manualScoreAway');
    manualPenaltyHome = document.getElementById('manualPenaltyHome');
    manualPenaltyAway = document.getElementById('manualPenaltyAway');
    manualScoreInfo = document.getElementById('manualScoreInfo');
    manualPlayersHomeContainer = document.getElementById('homePlayersContainer');
    manualPlayersAwayContainer = document.getElementById('awayPlayersContainer');
    manualBothForfeit = document.getElementById('manualBothForfeit');
    attachEventListeners();
    updateTeamInputs();
    await refreshList();
    showNotification('Bienvenue dans TFBall Manager. Cliquez sur la cloche pour lire les notifications.');
}

function applySearchFilter(query) {
    const q = String(query || '').trim().toLowerCase();
    const rows = document.querySelectorAll('#tournamentsTable tbody tr');
    rows.forEach(row => {
        if (!q) { row.style.display = ''; return; }
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(q) ? '' : 'none';
    });
}

async function renderStatsForSelected() {
    const t = selectedTournament;
    if (!t) return;
    const labels = (t.table || []).map(r => r.team || (r.team && r.team.name) || r.name);
    const data = (t.table || []).map(r => Number(r.points || 0));
    const canvas = document.getElementById('statsChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (statsChartInstance) statsChartInstance.destroy();
    statsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Points', data, backgroundColor: labels.map(() => 'rgba(56,189,248,0.75)') }] },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });
}

async function exportDashboardImage() {
    const el = document.getElementById('dashboardShell') || document.getElementById('managerContent') || document.body;
    if (!el) { showNotification('Aucun contenu à exporter.', 'error'); return; }
    try {
        const canvas = await html2canvas(el, { backgroundColor: null });
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = url;
        link.download = `${createSlug(selectedTournament?.name || 'dashboard')}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        showNotification('Image exportée.', 'success');
    } catch (error) {
        console.error(error);
        showNotification('Erreur lors de l’export de l’image.', 'error');
    }
}

function showHelpTour() {
    const steps = [
        'Barre de recherche : filtre les tournois et équipes en temps réel.',
        'Bouton Stats : affiche un graphique des points par équipe pour le tournoi sélectionné.',
        'Exporter image : capture la vue du tableau de bord en PNG.',
        'Mode boutons : bascule entre affichage compact et labels.',
        'Édition : utilisez Détails pour modifier un tournoi et ses matchs.'
    ];
    let step = 0;
    const helpStep = document.getElementById('helpStep');
    const prev = document.getElementById('helpPrev');
    const next = document.getElementById('helpNext');
    function update() { if (helpStep) helpStep.textContent = steps[step] || ''; if (prev) prev.disabled = step === 0; if (next) next.textContent = step === steps.length - 1 ? 'Terminer' : 'Suivant'; }
    if (prev) prev.onclick = () => { if (step > 0) { step -= 1; update(); } };
    if (next) next.onclick = () => { if (step < steps.length - 1) { step += 1; update(); } else { hideModal('helpModal'); } };
    showModal('helpModal'); update();
}

document.addEventListener('DOMContentLoaded', () => {
    init().catch(console.error);
});
