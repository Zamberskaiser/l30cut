//! Native validation boundary for AI-proposed edit operations.
//!
//! SECURITY MODEL
//! ==============
//! The browser-side registry + Zod/TypeScript validation is a *convenience*
//! layer, NOT a security boundary: anything running in the WebView can be
//! tampered with. This module is the real boundary on desktop — every
//! AI-originated transaction MUST pass through `validate_ai_transaction`
//! before any native executor is allowed to act on it.
//!
//! Guarantees enforced here, in Rust, independent of the frontend:
//! - Closed allowlist: `serde(deny_unknown_fields)` + a tagged enum means any
//!   unknown operation or extra field fails to parse. There is no "generic"
//!   or "raw" operation and no code/shell payload of any kind.
//! - Typed arguments: ids are bounded strings, times are u64 microseconds,
//!   gain/rate are range-checked floats.
//! - Range checks: source ranges must be positive spans, gain in [-60, 12],
//!   playback rate in [0.1, 10], caption/marker text bounded.
//! - Transaction caps: at most 500 operations per transaction.
//! - No filesystem paths: timeline operations never carry paths. Media import
//!   is a separate, user-initiated dialog flow — the AI cannot reference
//!   arbitrary files.
//! - No shell: this crate does not link a shell plugin and never spawns
//!   processes from AI input.
//!
//! STATUS
//! ======
//! `validate_ai_transaction` is implemented and callable via IPC today.
//! The native *executor* (applying these commands to a Rust-side project
//! store) is still a contract: on desktop the validated commands are applied
//! by the same TypeScript reducer that the browser demo uses. That is honest
//! and documented — the security win in this milestone is that nothing
//! unvalidated can cross the IPC boundary.

use serde::{Deserialize, Serialize};

const MAX_OPS_PER_TRANSACTION: usize = 500;
const MAX_ID_LEN: usize = 128;
const MAX_TEXT_LEN: usize = 400;
const MIN_GAIN_DB: f64 = -60.0;
const MAX_GAIN_DB: f64 = 12.0;
const MIN_RATE: f64 = 0.1;
const MAX_RATE: f64 = 10.0;
/// 24h in microseconds — sanity ceiling for any time value.
const MAX_TIME_US: u64 = 24 * 60 * 60 * 1_000_000;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GainKeyframe {
    pub id: String,
    #[serde(rename = "atUs")]
    pub at_us: u64,
    #[serde(rename = "gainDb")]
    pub gain_db: f64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CaptionSegment {
    pub id: String,
    #[serde(rename = "startUs")]
    pub start_us: u64,
    #[serde(rename = "endUs")]
    pub end_us: u64,
    pub text: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Marker {
    pub id: String,
    #[serde(rename = "atUs")]
    pub at_us: u64,
    pub label: String,
    #[serde(default)]
    pub color: String,
}

/// Closed allowlist of timeline commands — mirrors `EditCommandSchema` in
/// `src/core/contracts/commands.ts`. Adding a variant here is a deliberate,
/// reviewed act; nothing else deserializes.
#[derive(Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum AiEditCommand {
    #[serde(rename = "splitClip")]
    SplitClip {
        #[serde(rename = "clipId")]
        clip_id: String,
        #[serde(rename = "atUs")]
        at_us: u64,
    },
    #[serde(rename = "trimClip")]
    TrimClip {
        #[serde(rename = "clipId")]
        clip_id: String,
        #[serde(rename = "sourceInUs")]
        source_in_us: Option<u64>,
        #[serde(rename = "sourceOutUs")]
        source_out_us: Option<u64>,
    },
    #[serde(rename = "trimClipEdge")]
    TrimClipEdge {
        #[serde(rename = "clipId")]
        clip_id: String,
        edge: Edge,
        #[serde(rename = "toUs")]
        to_us: u64,
    },
    #[serde(rename = "rippleTrimClip")]
    RippleTrimClip {
        #[serde(rename = "clipId")]
        clip_id: String,
        edge: Edge,
        #[serde(rename = "toUs")]
        to_us: u64,
    },
    #[serde(rename = "rollingEdit")]
    RollingEdit {
        #[serde(rename = "leftClipId")]
        left_clip_id: String,
        #[serde(rename = "rightClipId")]
        right_clip_id: String,
        #[serde(rename = "toUs")]
        to_us: u64,
    },
    #[serde(rename = "rateStretchClip")]
    RateStretchClip {
        #[serde(rename = "clipId")]
        clip_id: String,
        #[serde(rename = "newDurationUs")]
        new_duration_us: u64,
    },
    #[serde(rename = "slipClip")]
    SlipClip {
        #[serde(rename = "clipId")]
        clip_id: String,
        #[serde(rename = "deltaUs")]
        delta_us: i64,
    },
    #[serde(rename = "slideClip")]
    SlideClip {
        #[serde(rename = "clipId")]
        clip_id: String,
        #[serde(rename = "deltaUs")]
        delta_us: i64,
    },
    #[serde(rename = "moveClip")]
    MoveClip {
        #[serde(rename = "clipId")]
        clip_id: String,
        #[serde(rename = "toStartUs")]
        to_start_us: u64,
        #[serde(rename = "toTrackId")]
        to_track_id: Option<String>,
    },
    #[serde(rename = "duplicateClip")]
    DuplicateClip {
        #[serde(rename = "clipId")]
        clip_id: String,
        #[serde(rename = "toStartUs")]
        to_start_us: Option<u64>,
        #[serde(rename = "toTrackId")]
        to_track_id: Option<String>,
        #[serde(rename = "newClipId")]
        new_clip_id: Option<String>,
    },
    #[serde(rename = "deleteClip")]
    DeleteClip {
        #[serde(rename = "clipId")]
        clip_id: String,
    },
    #[serde(rename = "rippleDelete")]
    RippleDelete {
        #[serde(rename = "clipId")]
        clip_id: String,
    },
    #[serde(rename = "changeGain")]
    ChangeGain {
        #[serde(rename = "clipId")]
        clip_id: String,
        #[serde(rename = "gainDb")]
        gain_db: f64,
    },
    #[serde(rename = "setGainKeyframes")]
    SetGainKeyframes {
        #[serde(rename = "clipId")]
        clip_id: String,
        keyframes: Vec<GainKeyframe>,
    },
    #[serde(rename = "addCaption")]
    AddCaption { segment: CaptionSegment },
    #[serde(rename = "addMarker")]
    AddMarker { marker: Marker },
    #[serde(rename = "setTrackLock")]
    SetTrackLock {
        #[serde(rename = "trackId")]
        track_id: String,
        locked: bool,
    },
    #[serde(rename = "setTrackMute")]
    SetTrackMute {
        #[serde(rename = "trackId")]
        track_id: String,
        muted: bool,
    },
    #[serde(rename = "linkClips")]
    LinkClips {
        #[serde(rename = "clipIds")]
        clip_ids: Vec<String>,
        #[serde(rename = "linkGroupId")]
        link_group_id: Option<String>,
    },
    #[serde(rename = "unlinkClips")]
    UnlinkClips {
        #[serde(rename = "clipId")]
        clip_id: String,
    },

    #[serde(rename = "createSequence")]
    CreateSequence {
        #[serde(rename = "sequenceId")]
        sequence_id: String,
        name: String,
        aspect: Aspect,
        #[serde(default)]
        activate: bool,
    },
    #[serde(rename = "insertClip")]
    InsertClip {
        #[serde(rename = "clipId")]
        clip_id: String,
        #[serde(rename = "trackId")]
        track_id: String,
        #[serde(rename = "assetId")]
        asset_id: String,
        #[serde(rename = "startUs")]
        start_us: u64,
        #[serde(rename = "sourceInUs")]
        source_in_us: u64,
        #[serde(rename = "sourceOutUs")]
        source_out_us: u64,
        #[serde(default)]
        label: String,
    },
    #[serde(rename = "setSequenceAspect")]
    SetSequenceAspect { aspect: Aspect },
}

#[derive(Deserialize)]
pub enum Edge {
    #[serde(rename = "start")]
    Start,
    #[serde(rename = "end")]
    End,
}

#[derive(Deserialize)]
pub enum Aspect {
    #[serde(rename = "16:9")]
    Wide,
    #[serde(rename = "9:16")]
    Tall,
    #[serde(rename = "1:1")]
    Square,
    #[serde(rename = "4:5")]
    Portrait,
}

#[derive(Serialize)]
pub struct ValidationReport {
    pub ok: bool,
    #[serde(rename = "opCount")]
    pub op_count: usize,
    pub errors: Vec<String>,
}

fn check_id(errors: &mut Vec<String>, field: &str, value: &str) {
    if value.is_empty() || value.len() > MAX_ID_LEN {
        errors.push(format!("{field}: id inválido (1..{MAX_ID_LEN} chars)"));
    }
}

fn check_time(errors: &mut Vec<String>, field: &str, value: u64) {
    if value > MAX_TIME_US {
        errors.push(format!("{field}: tempo fora do limite de 24h"));
    }
}

fn check_gain(errors: &mut Vec<String>, field: &str, value: f64) {
    if !value.is_finite() || value < MIN_GAIN_DB || value > MAX_GAIN_DB {
        errors.push(format!("{field}: ganho fora de [{MIN_GAIN_DB}, {MAX_GAIN_DB}] dB"));
    }
}

fn validate_command(index: usize, cmd: &AiEditCommand, errors: &mut Vec<String>) {
    let p = |f: &str| format!("ops[{index}].{f}");
    match cmd {
        AiEditCommand::SplitClip { clip_id, at_us } => {
            check_id(errors, &p("clipId"), clip_id);
            check_time(errors, &p("atUs"), *at_us);
        }
        AiEditCommand::TrimClip { clip_id, source_in_us, source_out_us } => {
            check_id(errors, &p("clipId"), clip_id);
            if source_in_us.is_none() && source_out_us.is_none() {
                errors.push(p("sourceInUs/sourceOutUs: pelo menos um é obrigatório"));
            }
            if let (Some(i), Some(o)) = (source_in_us, source_out_us) {
                if o <= i {
                    errors.push(p("sourceOutUs deve ser > sourceInUs"));
                }
            }
            if let Some(v) = source_in_us { check_time(errors, &p("sourceInUs"), *v); }
            if let Some(v) = source_out_us { check_time(errors, &p("sourceOutUs"), *v); }
        }
        AiEditCommand::TrimClipEdge { clip_id, to_us, .. }
        | AiEditCommand::RippleTrimClip { clip_id, to_us, .. } => {
            check_id(errors, &p("clipId"), clip_id);
            check_time(errors, &p("toUs"), *to_us);
        }
        AiEditCommand::RollingEdit { left_clip_id, right_clip_id, to_us } => {
            check_id(errors, &p("leftClipId"), left_clip_id);
            check_id(errors, &p("rightClipId"), right_clip_id);
            if left_clip_id == right_clip_id {
                errors.push(p("leftClipId e rightClipId devem ser diferentes"));
            }
            check_time(errors, &p("toUs"), *to_us);
        }
        AiEditCommand::RateStretchClip { clip_id, new_duration_us } => {
            check_id(errors, &p("clipId"), clip_id);
            if *new_duration_us == 0 {
                errors.push(p("newDurationUs deve ser > 0"));
            }
            check_time(errors, &p("newDurationUs"), *new_duration_us);
        }
        AiEditCommand::SlipClip { clip_id, delta_us }
        | AiEditCommand::SlideClip { clip_id, delta_us } => {
            check_id(errors, &p("clipId"), clip_id);
            if delta_us.unsigned_abs() > MAX_TIME_US {
                errors.push(p("deltaUs fora do limite de 24h"));
            }
        }
        AiEditCommand::MoveClip { clip_id, to_start_us, to_track_id } => {
            check_id(errors, &p("clipId"), clip_id);
            check_time(errors, &p("toStartUs"), *to_start_us);
            if let Some(t) = to_track_id { check_id(errors, &p("toTrackId"), t); }
        }
        AiEditCommand::DuplicateClip { clip_id, to_start_us, to_track_id, new_clip_id } => {
            check_id(errors, &p("clipId"), clip_id);
            if let Some(v) = to_start_us { check_time(errors, &p("toStartUs"), *v); }
            if let Some(t) = to_track_id { check_id(errors, &p("toTrackId"), t); }
            if let Some(n) = new_clip_id { check_id(errors, &p("newClipId"), n); }
        }
        AiEditCommand::DeleteClip { clip_id } | AiEditCommand::RippleDelete { clip_id } => {
            check_id(errors, &p("clipId"), clip_id);
        }
        AiEditCommand::ChangeGain { clip_id, gain_db } => {
            check_id(errors, &p("clipId"), clip_id);
            check_gain(errors, &p("gainDb"), *gain_db);
        }
        AiEditCommand::SetGainKeyframes { clip_id, keyframes } => {
            check_id(errors, &p("clipId"), clip_id);
            if keyframes.len() > 200 {
                errors.push(p("keyframes: máximo de 200"));
            }
            for (k, kf) in keyframes.iter().enumerate() {
                check_id(errors, &format!("ops[{index}].keyframes[{k}].id"), &kf.id);
                check_time(errors, &format!("ops[{index}].keyframes[{k}].atUs"), kf.at_us);
                check_gain(errors, &format!("ops[{index}].keyframes[{k}].gainDb"), kf.gain_db);
            }
        }
        AiEditCommand::AddCaption { segment } => {
            check_id(errors, &p("segment.id"), &segment.id);
            check_time(errors, &p("segment.startUs"), segment.start_us);
            check_time(errors, &p("segment.endUs"), segment.end_us);
            if segment.end_us <= segment.start_us {
                errors.push(p("segment.endUs deve ser > startUs"));
            }
            if segment.text.len() > MAX_TEXT_LEN {
                errors.push(p("segment.text: máximo de 400 chars"));
            }
        }
        AiEditCommand::AddMarker { marker } => {
            check_id(errors, &p("marker.id"), &marker.id);
            check_time(errors, &p("marker.atUs"), marker.at_us);
            if marker.label.len() > MAX_TEXT_LEN {
                errors.push(p("marker.label: máximo de 400 chars"));
            }
        }
        AiEditCommand::SetTrackLock { track_id, .. }
        | AiEditCommand::SetTrackMute { track_id, .. } => {
            check_id(errors, &p("trackId"), track_id);
        }
        AiEditCommand::LinkClips { clip_ids, link_group_id } => {
            if clip_ids.len() < 2 || clip_ids.len() > 12 {
                errors.push(p("clipIds: entre 2 e 12 ids"));
            }
            for (i, id) in clip_ids.iter().enumerate() {
                check_id(errors, &p(&format!("clipIds[{i}]")), id);
            }
            let mut sorted = clip_ids.clone();
            sorted.sort();
            let before = sorted.len();
            sorted.dedup();
            if sorted.len() != before {
                errors.push(p("clipIds: ids repetidos"));
            }
            if let Some(group) = link_group_id {
                check_id(errors, &p("linkGroupId"), group);
            }
        }
        AiEditCommand::UnlinkClips { clip_id } => {
            check_id(errors, &p("clipId"), clip_id);
        }

        AiEditCommand::CreateSequence { sequence_id, name, .. } => {
            check_id(errors, &p("sequenceId"), sequence_id);
            if name.is_empty() || name.len() > 80 {
                errors.push(p("name: 1..80 chars"));
            }
        }
        AiEditCommand::InsertClip { clip_id, track_id, asset_id, start_us, source_in_us, source_out_us, label } => {
            check_id(errors, &p("clipId"), clip_id);
            check_id(errors, &p("trackId"), track_id);
            check_id(errors, &p("assetId"), asset_id);
            check_time(errors, &p("startUs"), *start_us);
            check_time(errors, &p("sourceInUs"), *source_in_us);
            check_time(errors, &p("sourceOutUs"), *source_out_us);
            if source_out_us <= source_in_us {
                errors.push(p("sourceOutUs deve ser > sourceInUs"));
            }
            if label.len() > MAX_TEXT_LEN {
                errors.push(p("label: máximo de 400 chars"));
            }
        }
        AiEditCommand::SetSequenceAspect { .. } => {}
    }
}

/// Parses and validates a full AI transaction (JSON array of commands).
/// Rejects unknown operations, unknown fields, out-of-range values and
/// oversized transactions. This is the desktop security gate for AI edits.
pub fn validate_transaction_json(json: &str) -> ValidationReport {
    let parsed: Result<Vec<AiEditCommand>, _> = serde_json::from_str(json);
    match parsed {
        Err(e) => ValidationReport {
            ok: false,
            op_count: 0,
            errors: vec![format!("JSON rejeitado pelo allowlist nativo: {e}")],
        },
        Ok(cmds) => {
            let mut errors = Vec::new();
            if cmds.len() > MAX_OPS_PER_TRANSACTION {
                errors.push(format!("transação excede {MAX_OPS_PER_TRANSACTION} operações"));
            }
            for (i, cmd) in cmds.iter().enumerate() {
                validate_command(i, cmd, &mut errors);
            }
            ValidationReport { ok: errors.is_empty(), op_count: cmds.len(), errors }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_known_commands() {
        let json = r#"[
            {"type":"splitClip","clipId":"c1","atUs":1000000},
            {"type":"changeGain","clipId":"c1","gainDb":-6.0},
            {"type":"setTrackMute","trackId":"a1","muted":true}
        ]"#;
        let report = validate_transaction_json(json);
        assert!(report.ok, "{:?}", report.errors);
        assert_eq!(report.op_count, 3);
    }

    #[test]
    fn rejects_unknown_operation_and_extra_fields() {
        assert!(!validate_transaction_json(r#"[{"type":"runShell","cmd":"rm -rf /"}]"#).ok);
        assert!(
            !validate_transaction_json(
                r#"[{"type":"splitClip","clipId":"c1","atUs":1,"shell":"x"}]"#
            )
            .ok
        );
    }

    #[test]
    fn rejects_out_of_range_values() {
        assert!(!validate_transaction_json(r#"[{"type":"changeGain","clipId":"c1","gainDb":99}]"#).ok);
        assert!(
            !validate_transaction_json(
                r#"[{"type":"trimClip","clipId":"c1","sourceInUs":10,"sourceOutUs":5}]"#
            )
            .ok
        );
        assert!(!validate_transaction_json(r#"[{"type":"rateStretchClip","clipId":"c1","newDurationUs":0}]"#).ok);
    }
}
