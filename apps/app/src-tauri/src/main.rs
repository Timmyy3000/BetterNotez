// Hides the console window that Windows would otherwise open next to the app in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    betternotez_lib::run()
}
