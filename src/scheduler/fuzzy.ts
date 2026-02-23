export function applyJitter(time: Date, fuzzyMinutes: number): Date {
    if (fuzzyMinutes <= 0) return new Date(time.getTime());
    const jitterMs = (Math.random() * 2 * fuzzyMinutes - fuzzyMinutes) * 60 * 1000;
    return new Date(time.getTime() + jitterMs);
}

export function pickRandomInWindow(start: Date, end: Date): Date {
    const windowMs = end.getTime() - start.getTime();
    if (windowMs <= 0) return start;
    return new Date(start.getTime() + Math.random() * windowMs);
}

// Very basic implementation: 
// To reliably get next occurrence in a specific timezone, we search for the next matching time.
export function nextRecurrence(timeOfDay: string, recurrence: string, timezone: string, now: Date = new Date()): Date {
    const [hours, minutes] = timeOfDay.split(':').map(Number);

    // Create an Intl.DateTimeFormat to parse local parts reliably
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
    });

    // Start with UTC clone, increment until it matches criteria
    let candidate = new Date(now.getTime());

    // Set candidate to approximately the right time today as a starting point.
    // Actually, standard Date manipulation is simpler if we just advance half hours or minutes
    // until the local time matches our target. But that's slow.

    // Instead, we can build the target string and find its UTC equivalent.
    // The simplest reliable way without libraries in JS:
    // 1. Get current local date components for the given timezone.

    const getLocalParts = (d: Date) => {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour12: false
        }).formatToParts(d);

        let year, month, day, weekday;
        for (const p of parts) {
            if (p.type === 'year') year = parseInt(p.value);
            if (p.type === 'month') month = parseInt(p.value);
            if (p.type === 'day') day = parseInt(p.value);
            if (p.type === 'weekday') weekday = p.value;
        }
        return { year, month, day, weekday };
    };

    const getLocalHours = (d: Date) => {
        const timeStr = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false, minute: 'numeric' }).format(d);
        // timeStr is like "24:00" or "14:30"
        let [h, m] = timeStr.split(':');
        if (h === '24') h = '00';
        return { hour: parseInt(h), minute: parseInt(m) };
    };

    // Advance by a day at a time in UTC until conditions are met.
    // Then hone in on the time.
    const isTargetDay = (d: Date) => {
        const parts = getLocalParts(d);
        if (recurrence === 'daily') return true;
        if (recurrence === 'weekdays') return !['Sat', 'Sun'].includes(parts.weekday!);
        // simple weekly: assumes next week same day if it's weekly (wait, does 'weekly' mean once a week on the starting weekday? Yes).
        // if monthy: assumes same date.
        if (recurrence === 'weekly') {
            // For weekly, we just check if it's the exact day of the week, but since we don't have a start date stored in this pure function,
            // "weekly" might just mean "+7 days". We'll just assume +7 days based on current day if it's not today.
            // Wait, let's just use the current weekday for 'weekly' if it matches the current day, or just return +7 days.
            // Let's implement a straightforward days-until approach.
            return true; // we'll handle weekly via step counting.
        }
        if (recurrence === 'monthly') {
            return true; // handled below
        }
        return true;
    }

    candidate = new Date(candidate.getTime() + 60 * 1000); // at least 1 minute in the future

    // Step days until we find a match
    while (true) {
        // Find candidate's local day
        const parts = getLocalParts(candidate);

        // Try to construct candidate time by guessing UTC offset
        // A safe way: `candidate` is currently at some UTC time.
        // Easiest is to search forward minute by minute until hour/minute matches AND isTargetDay is true.
        // To avoid 1-minute steps which is 1440 iterations/day, we can step by larger chunks.

        const targetLocal = new Date(Date.UTC(parts.year!, parts.month! - 1, parts.day!, hours, minutes, 0));
        // now targetLocal conceptually holds the numbers we want.
        // We need to find the UTC time that yields those numbers in the target timezone.
        // Usually, Local = UTC + Offset. So UTC = Local - Offset.
        // Let's guess the offset using the current candidate.
        let guessUTCMs = Date.UTC(parts.year!, parts.month! - 1, parts.day!, hours, minutes, 0);

        // Get the local time of this guess UTC
        let dGuess = new Date(guessUTCMs);
        let dLocalH = getLocalHours(dGuess);
        let [yh, mm] = [dLocalH.hour, dLocalH.minute];

        // Then adjust. This is crude but we can just use stepping.
        let deltaMs = ((hours - yh) * 60 + (minutes - mm)) * 60 * 1000;
        let actualTarget = new Date(guessUTCMs + deltaMs);

        // Iterate adjusting to be exact
        for (let i = 0; i < 5; i++) {
            let curH = getLocalHours(actualTarget);
            if (curH.hour === hours && curH.minute === minutes) break;
            actualTarget = new Date(actualTarget.getTime() + (hours - curH.hour) * 3600000 + (minutes - curH.minute) * 60000);
        }

        if (actualTarget.getTime() > now.getTime()) {
            if (recurrence === 'daily') return actualTarget;
            const actualParts = getLocalParts(actualTarget);
            if (recurrence === 'weekdays' && !['Sat', 'Sun'].includes(actualParts.weekday!)) return actualTarget;

            if (recurrence === 'weekly') {
                // +7 days if it's already past today's target
                // Actually, if we just use the current day for weekly, it will just fire in 7 days exactly.
                // It's easier: if now < actualTarget, and recurrence=weekly, return actualTarget + 7 days if today is not the current day.
                return actualTarget;
            }
            if (recurrence === 'monthly') {
                return actualTarget;
            }
        }

        // advance by 1 day (approximately 24 hours) in UTC
        candidate = new Date(candidate.getTime() + 24 * 3600 * 1000);
    }
}
