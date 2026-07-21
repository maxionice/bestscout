fn main() {
    let environment = bestscout_live::discover_environment();
    match serde_json::to_string_pretty(&environment) {
        Ok(json) => println!("{json}"),
        Err(error) => {
            eprintln!("cannot serialize diagnostic result: {error}");
            std::process::exit(1);
        }
    }
}
