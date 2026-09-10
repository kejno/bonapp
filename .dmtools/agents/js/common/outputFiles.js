/**
 * Shared helpers for reading agent output artifacts.
 *
 * Normalization order for output files:
 * 1) outputs/<name>
 * 2) outputs/<ticketKey>/<name>                (if ticketKey provided)
 * 3) <workingDir>/outputs/<name>               (if workingDir provided)
 * 4) <workingDir>/outputs/<ticketKey>/<name>   (if workingDir + ticketKey provided)
 *
 * For absolute paths we read the path as-is.
 */

function readRaw(path) {
    if (!path) return null;

    // file_read() is sandboxed to the JSRunner cwd (.dmtools/) and cannot
    // reach any file outside it — confirmed by probing a guaranteed-existing
    // repo-root file (package.json): every absolute-path and ".." variant
    // returned null even though the file was there. So absolute paths (our
    // repo-root fallback candidates, since the CLI agent's own Write tool
    // lands files in repo root, not .dmtools/) must go through the shell
    // instead, via cli_execute_command("cat ...") — that tool is not
    // cwd-sandboxed the same way (git rev-parse from repo root already
    // works through it).
    if (path.indexOf('/') === 0) {
        try {
            var catOut = cli_execute_command({ command: 'cat ' + path });
            var catStr = catOut == null ? '' : String(catOut);
            if (catStr.trim() && catStr.indexOf('No such file or directory') === -1) {
                return catStr;
            }
        } catch (e) {}
        return null;
    }

    try {
        var content = file_read({ path: path });
        if (content && content.toString().trim()) {
            return content;
        }
    } catch (e) {}
    return null;
}

function normalizeToOutputsPath(pathOrName) {
    if (!pathOrName) return '';
    if (pathOrName.indexOf('outputs/') === 0) return pathOrName;
    if (pathOrName.indexOf('/') === -1) return 'outputs/' + pathOrName;
    return pathOrName;
}

function buildOutputCandidates(pathOrName, options) {
    var opts = options || {};
    var ticketKey = opts.ticketKey;
    var workingDir = opts.workingDir;
    var normalized = normalizeToOutputsPath(pathOrName);
    var candidates = [];

    // Absolute path: use as-is first, then (optionally) also workingDir prefix if provided by caller path.
    if (normalized.indexOf('/') === 0) {
        candidates.push(normalized);
        return candidates;
    }

    candidates.push(normalized);

    if (normalized.indexOf('outputs/') === 0 && ticketKey) {
        var outputName = normalized.substring('outputs/'.length);
        candidates.push('outputs/' + ticketKey + '/' + outputName);
    }

    if (workingDir) {
        candidates.push(workingDir + '/' + normalized);
        if (normalized.indexOf('outputs/') === 0 && ticketKey) {
            var outputNameInWd = normalized.substring('outputs/'.length);
            candidates.push(workingDir + '/outputs/' + ticketKey + '/' + outputNameInWd);
        }
    }

    // Three different cwds are in play in this setup, and an output file can
    // land under any of them depending on which one wrote it:
    //   - file_write() from JS in JSRunner  -> .dmtools/ (working-directory in the workflow)
    //   - the CLI agent's own Write tool    -> repo root (its own process cwd)
    //   - cli_execute_command subprocesses  -> repo root
    // file_read() resolves against JSRunner's .dmtools/ cwd AND does not
    // honour ".." traversal (probed: file_read("../outputs/X") misses a file
    // `ls` confirms is right there), so the repo-root copy is only reachable
    // by absolute path. Ask the shell for the repo root and add absolute
    // twins of the plain relative candidates.
    var repoRoot = null;
    try {
        var rootOut = cli_execute_command({ command: 'git rev-parse --show-toplevel' });
        repoRoot = String(rootOut || '').split('\n').map(function(s) { return s.trim(); })
            .filter(function(s) { return s.indexOf('/') === 0; })[0] || null;
    } catch (e) {}

    if (repoRoot) {
        var base = repoRoot.replace(/\/$/, '');
        var absolute = [];
        for (var i = 0; i < candidates.length; i++) {
            // Only the plain relative forms — prefixing a "../" candidate
            // would produce <root>/../outputs/... which is both wrong and
            // untraversable by file_read anyway.
            if (candidates[i].indexOf('../') === 0) continue;
            absolute.push(base + '/' + candidates[i]);
        }
        candidates = candidates.concat(absolute);
    }

    return candidates;
}

function readOutputFile(pathOrName, options) {
    var candidates = buildOutputCandidates(pathOrName, options);
    for (var i = 0; i < candidates.length; i++) {
        var content = readRaw(candidates[i]);
        if (content) {
            return content;
        }
    }
    return null;
}

function readOutputFileDetailed(pathOrName, options) {
    var candidates = buildOutputCandidates(pathOrName, options);
    for (var i = 0; i < candidates.length; i++) {
        var content = readRaw(candidates[i]);
        if (content) {
            return { content: content, path: candidates[i] };
        }
    }
    return null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        normalizeToOutputsPath: normalizeToOutputsPath,
        buildOutputCandidates: buildOutputCandidates,
        readOutputFile: readOutputFile,
        readOutputFileDetailed: readOutputFileDetailed
    };
}
