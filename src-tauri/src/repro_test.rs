#[cfg(test)]
mod tests {
    use crate::creator::{escape_drawtext, escape_filter_path, filter_path_is_safe};

    #[test]
    fn test_drawtext_escaping() {
        // Current behavior: strips apostrophes and colons
        assert_eq!(escape_drawtext("Scene 1: 'Hello'"), "Scene 1 Hello");
    }

    #[test]
    fn test_font_path_escaping() {
        let path = "C:\\Windows\\Fonts\\arial.ttf";
        let escaped = escape_filter_path(path);
        // Current behavior: replaces \ with / and escapes :
        assert_eq!(escaped, "C\:/Windows/Fonts/arial.ttf");
        assert!(filter_path_is_safe(&escaped));
    }
}
