# Passive Blackbox motion analysis

Implementation branch: `codex/passive-blackbox-analysis`. No Jev dependency or decision-provider calls.

The local analysis pipeline now includes versioned normalization, local continuous spans, slow-frame state records and event payloads, mixer-throttle coverage, time-weighted tracking error, input candidates, observed near-step metrics, direction/configuration/context-separated distributions, and a separate regularized closed-loop response estimate. The Worker retains full-resolution channels and serves bounded action curves on demand. The frontend keeps rejected candidates visible, shows partial coverage and finite-observation limitations, and links AI evidence back to local groups/actions.

## Contracts

- Local report: `0.3.0`; algorithm: `passive-core-0.3.0`; policy: `passive-policy-1.0`.
- AI evidence/conclusion: `1.1`; old `1.0` contracts remain supported for legacy inputs.
- Numerical measurements come from local code. Generated model prose is interpretation; metric references bind displayed values to the actual evidence packet.
- AI packets remain within 32 KiB. Only derived summaries are sent; raw BBL, channels, filenames, locations, free-form headers and credentials are excluded.
- The provider/key/model configuration remains independent of analysis. No parameter-write path is introduced.

## Measurement limits

- Near-step eligibility requires a stable 100 ms input pre-platform, input transition no longer than 50 ms, minimum 30 deg/s change, and 250 ms post-hold. These engineering thresholds have not been calibrated on a labeled corpus.
- Poor responses remain eligible if input conditions qualify. Initial bias, missing crossings and finite observation each have explicit metric statuses. Settling not confirmed in the window is censored, never reported as zero or as the window duration.
- Response normalization references the commanded target. Gyro tails are not forced to unity.
- Error RMS/MAE use trapezoidal time weights without shifting gyro. p95 is a time-weighted 2048-bin histogram approximation with recorded resolution.
- Mixer-throttle/output-bound adapters currently require verified Betaflight 4.5.x or 2025.12.x, explicit features excluding 3D, and valid source fields. Other angular-unit-supported versions can still have unavailable throttle capabilities.
- Logged mode flags do not establish ARMED or actual flight. Receiver/failsafe context is tagged; unknown flight state is retained.
- Motor-command proximity to logged output bounds does not establish physical thrust saturation, temperature or ESC current.
- Deconvolution estimates use continuous 2 s windows, independent-support and input-excitation checks, explicit sampling caps, and no forced tail normalization. DC gain/steady-state metrics are not established. Different configuration/context groups are not pooled.
- Candidate summaries cap at 50,000 with explicit partial status; estimation caps at 15 groups and 256 sampled windows per group/axis, with omitted/skipped counts. Drawing is an envelope approximation; numerical metrics retain full resolution.

## Validation

Run `npx vitest run test/passive-tune`, modified-file ESLint and `npm run build`. Numerical tests use independent analytical first-order responses, positive/negative actions, biased and poor responses, time gaps, unequal dt, constant/identity inputs, oscillation candidates, coverage accounting, bounded AI packets, invalid references and stale curve replies.

Browser validation uses a public real BBL and a separately labeled synthetic first-order step fixture. Real-log screenshots/exported AI reports are evidence of integration, not a precision certification. Labeled real-flight holdout calibration, aircraft coverage and cross-device performance remain separate work; do not claim the planned 95%/80% detection targets have been achieved.

## References

- [Betaflight 4.5.2 logging semantics](https://github.com/betaflight/betaflight/blob/4.5.2/src/main/blackbox/blackbox.c)
- [OctavePIDtoolbox step calculator](https://github.com/mituritsyn/OctavePIDtoolbox/blob/master/PTstepcalc.m)
- [PIDTuna browser implementation](https://github.com/Manwe-777/pid-tuna/blob/main/src/dsp/stepResponse.ts)
- [Python control response metrics](https://python-control.readthedocs.io/en/latest/generated/control.step_info.html)

Algorithms here are project implementations; existing `ComplexFFT` is reused with its original BSD-2-Clause attribution. These references use different normalization, selection and metric conventions and are not interchangeable ground truth.
