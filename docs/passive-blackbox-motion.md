# Passive Blackbox motion analysis

Implementation branch: `codex/passive-blackbox-analysis`. No Jev dependency or decision-provider calls.

The local analysis pipeline now includes versioned normalization, local continuous spans, slow-frame state records and event payloads, mixer-throttle coverage, time-weighted tracking error, input candidates, observed near-step metrics, direction/configuration/context-separated distributions, and a separate regularized closed-loop response estimate. The Worker retains full-resolution channels and serves bounded action curves on demand. The frontend keeps rejected candidates visible, shows partial coverage and finite-observation limitations, and links AI evidence back to local groups/actions.

## Contracts

- Local report: `0.5.0`; algorithm: `passive-core-0.5.0`; policy: `passive-policy-1.1`.
- AI evidence/conclusion: `1.2`; old `1.0` and `1.1` conclusion parsing remains supported with their matching evidence versions.
- Numerical measurements come from local code. Generated model prose is interpretation; metric references bind displayed values to the actual evidence packet.
- AI packets remain within 96 KiB. Only derived summaries are sent; raw BBL, channels, filenames, locations, free-form headers and credentials are excluded.
- The provider/key/model configuration remains independent of analysis. No parameter-write path is introduced.

## Measurement limits

- Near-step eligibility requires a stable 100 ms input pre-platform, input transition no longer than 50 ms, minimum 30 deg/s change, and 250 ms post-hold. These engineering thresholds have not been calibrated on a labeled corpus.
- Poor responses remain eligible if input conditions qualify. Initial bias, missing crossings and finite observation each have explicit metric statuses. Settling not confirmed in the window is censored, never reported as zero or as the window duration.
- Response normalization references the commanded target. Gyro tails are not forced to unity.
- Error RMS/MAE use trapezoidal time weights without shifting gyro. p95 is a time-weighted 2048-bin histogram approximation with recorded resolution.
- Mixer-throttle/output-bound adapters currently require verified Betaflight 4.5.x, 2025.12.x or 2026.6.x, explicit features excluding 3D, and valid source fields. Other angular-unit-supported versions can still have unavailable throttle capabilities.
- Logged mode flags do not establish ARMED or actual flight. Receiver/failsafe context is tagged; unknown flight state is retained.
- Motor-command proximity to logged output bounds does not establish physical thrust saturation, temperature or ESC current.
- Deconvolution estimates use continuous 2 s windows, independent-support and input-excitation checks, explicit sampling caps, and no forced tail normalization. DC gain/steady-state metrics are not established. Different configuration/context groups are not pooled.
- Candidate summaries cap at 50,000 with explicit partial status; estimation caps at 15 groups and 256 sampled windows per group/axis, with omitted/skipped counts. Drawing is an envelope approximation; numerical metrics retain full resolution.

## V0.4 foundation

- Candidate selection no longer controls all diagnosis: `standard_step`, `continuous_tracking` and `mixed_maneuver` each expose independent step/tracking/control/output capabilities. Strict near-step rules are retained. Non-step events carry raw time-weighted error and local control/output metrics, with original rejection reasons.
- P/I/D/FF are decoded in logged controller output units. Mean, RMS, absolute peak and single-window end-minus-start use actual timestamps. P versus setpoint-minus-gyro error and FF versus command derivative are zero-lag associations, not causal attribution or parameter recommendations. Missing yaw D remains unavailable, not synthesized as zero.
- D and unfiltered/filtered gyro band RMS use continuous common-rate Welch windows. Unfiltered gyro follows angular high-resolution scaling; PID outputs do not. Band activity does not establish RPM behavior, filter safety or physical vibration causes.
- Local lag estimates search 0–100 ms at 5 ms spacing (shorter windows use a smaller range), with common overlap, excitation, correlation, ambiguity and search-edge gates. They remain limited estimates and never align away primary error. Thresholds are not corpus-calibrated.
- Every S record refreshes state, including `stateFlags`. The initial record and the first refresh after a boundary reanchor the timeline; unchanged refreshes do not fragment valid windows. Configuration boundaries retain valid state; timestamp/corruption boundaries invalidate it. Recorded mode/receiver flags do not establish ARMED or airborne state.
- All tracking and action group summaries are mandatory in AI evidence. Optional representative frequency points, estimate details and per-axis representative events may be reduced with explicit counts. Mandatory summaries exceeding 96 KiB cause an explicit error; the local result remains available. JSON strings are never truncated. Complete input JSON can be downloaded independently of model success.
- Motion evidence renames frequency `peak` to `maxObservedGain`, with support-edge/coherence/excitation markers. Legacy non-motion evidence keeps its existing contract. Sample coverage is explicitly within parsed samples; timestamp-based expected coverage is a separate estimate, not proof of capture completeness. Boundary records carry affected times and source types. Candidate and step-eligible confounded counts have separate names.

On the local `btfl_002.bbl` regression (2026.6.2, 463497 main frames, 231.8 s), all 92 roll, 56 pitch and 68 yaw candidates yield tracking observations; none qualifies as a standard near step. Throttle/output adapters and P/I/FF (roll/pitch D) are available. This proves capability and data-flow integration, not tuning quality or detection precision.

## V0.5 diagnostic evidence

- Full throttle groups own each interval by its left endpoint, retaining the right sample for trapezoidal integration. Adjacent groups can share an endpoint but never an interval. The full groups no longer require stable throttle. Independent stable windows split greedily at a 5 percentage-point range and require 250ms; changing/bin-transition, short, unknown and invalid intervals complete an exclusive ledger. This is a command grouping policy, not a flight-state or stationarity certification. The changing-throttle ledger category counts transition intervals only; it is not total throttle variation and is distinct from event-level CHANGING_THROTTLE.
- Group tracking uses complete available intervals. Estimation uses only stable-window candidates and retains its independent 2s/support/excitation criteria. A stable tracking fragment does not automatically qualify for frequency estimation.
- Global, throttle group, event and phase output evidence includes both bound fractions and run lengths. Per-motor extrema, valid/invalid durations, lower/upper times and minimum normalized command room are local/report data. Global fractions use time where all motors are valid; individual motor fractions use that motor's valid time. Concurrent-lower-motor count durations use the global denominator. Fractions use left-endpoint time weights. Boundary proximity never establishes physical thrust limitation.
- Measurement availability, per-diagnostic input qualification and context limitations are separate. Tracking comparison requires at least 250ms, 20 measured intervals, 30deg/s input range and 5deg/s centered command RMS. Continuous candidates use the event command window; strict near-steps additionally use their validated pre-platform so an ideal one-sample transition does not appear unexcited. Poor gyro responses do not remove otherwise qualified input.
- Recorded context uses `stateFieldsPresent`. For verified 2026.6.2 commit e0b7bb01b, only the ARM switch bit in the logged low-32-bit RC mode mask is decoded; remaining bits are explicitly unknown. Other builds retain undecoded context. Actual arming/airborne states remain unknown. Missing state constrains attribution without erasing measured observations.
- Command changes, first confirmed 50ms bounded-range hold, stop input and post-stop observation are detected from Setpoint only. Transition includes its preceding in-span sample so a single-sample step has a measured interval. Phase edges are actual sample times. A stop requires prior command magnitude >=30deg/s and a >=50ms platform within +/-15deg/s. Post-stop observation ends at the next command change, analysis boundary or 500ms after the stop. The original event summary deadline is not treated as a data boundary; the curve includes the full available phase follow-up. Extended phase throttle/cross-axis/bound context is evaluated separately.
- Post-stop metrics use recorded angular rate: peak, complete 100ms RMS bins, alternating candidates from 5ms median bins (>=3deg/s, >=10ms spacing), and last/first 100ms RMS ratio only with >=200ms observation and >=3deg/s initial activity. These are not attitude rebound, resonance or standard-step settling metrics. Missing phases, finite windows and unavailable ratios remain explicit.
- Six per-axis representative categories are deterministic, deduplicated and carry population counts: typical/worst qualified tracking, lower/upper constraints, qualified stop and greatest measured stop residual. Ties use event ids. Under the byte limit, constraint/residual evidence is prioritized; omitted representatives/categories and estimates are counted, with at least one selected representative retained per represented axis.
- Evidence 1.2 transmits `summary`, `evidence`, and `analysisPolicy`, with source/scope/version metadata. Empty step distributions are omitted when eligibleCount=0. Identical motor group evidence is shared by three axes via ids. Phase summaries are compact; full phase metrics remain in local report. The stop/change duplicate phase references one measurement object. Optional reductions never remove mandatory group summaries or the coverage ledger.
- Local lag is named `localLagCandidateMs`. AI facts/estimates require registered finite metric references. Possible explanations additionally require a supported category, real corresponding evidence, limitations and verification method. Exact serialized JSON numeric paths can be normalized to canonical evidence-id references only when the actual value exists and belongs to the cited evidence; arbitrary/cross-evidence paths remain rejected. V1.2 enforces concise prose limits and disallows unbound numbers in findings; recording/verification suggestions also reject explicit actionable control changes and fast-input instructions. Out-of-scope next-step suggestions may be omitted with an explicit policy-filter count only when at least two valid model suggestions remain; otherwise the conclusion is rejected. These checks are conservative tripwires, not semantic proof. The prompt offers direct owning-id numeric references rather than nested coverage-root copies. A V1.2 validation failure permits exactly one corrective request with the same full evidence; transport/truncation errors are not automatically retried. Model prose still needs human judgment and is not a causal certification.

### Reproduce a local sample audit

Use Node 24:

```sh
node scripts/passive-ai/analyze-sample.mjs /path/to/log.bbl /path/to/output-directory
```

This writes a full local report, the exact bounded AI evidence and a coverage/regression audit without calling a provider. The 500134-frame source with SHA-256 `95dcf89550ccf087a60be0b826aa042f9bebafef948187bbbd4990e8a3ff872e` has explicit regression assertions: 250.125712s complete throttle coverage on all axes, 391 candidates, zero strict steps, the critical roll lower-bound fraction 1.0, and the short pitch event measurable but comparison-ineligible. No raw BBL is committed.

## Validation

Run `npx vitest run test/passive-tune`, modified-file ESLint and `npm run build`. Numerical tests use independent analytical first-order responses, positive/negative actions, biased and poor responses, time gaps, unequal dt, constant/identity inputs, oscillation candidates, coverage accounting, bounded AI packets, invalid references and stale curve replies.

Browser validation uses a public real BBL and a separately labeled synthetic first-order step fixture. Real-log screenshots/exported AI reports are evidence of integration, not a precision certification. Labeled real-flight holdout calibration, aircraft coverage and cross-device performance remain separate work; do not claim the planned 95%/80% detection targets have been achieved.

## References

- [Betaflight 2026.6.2 logging and units](https://github.com/betaflight/betaflight/blob/2026.6.2/src/main/blackbox/blackbox.c)
- [Betaflight 4.5.2 logging semantics](https://github.com/betaflight/betaflight/blob/4.5.2/src/main/blackbox/blackbox.c)
- [OctavePIDtoolbox step calculator](https://github.com/mituritsyn/OctavePIDtoolbox/blob/master/PTstepcalc.m)
- [PIDTuna browser implementation](https://github.com/Manwe-777/pid-tuna/blob/main/src/dsp/stepResponse.ts)
- [Python control response metrics](https://python-control.readthedocs.io/en/latest/generated/control.step_info.html)

Algorithms here are project implementations; existing `ComplexFFT` is reused with its original BSD-2-Clause attribution. These references use different normalization, selection and metric conventions and are not interchangeable ground truth.
