# bncr

IRC bot that automates some of OP chores

* Give **+v** to users from whitelist (see `voiced`)

* Give **+o** to users from whitelist with registered account (see `ops`)

* Kicks user from blacklist on join (see `kickOnJoin`)

* Kicks user on message that matches regexp (see `kickPatterns`, `kickIgnores`)

* Auto-rejoins channel when kicked by someone

* Auto-reloads config when `config.toml` is changed

## Usage

* Install dependencies by running `yarn`

* Create config by running `cp config.example.toml config.toml`

* Edit config

* Start bot by running `yarn start`

## Docker

    docker build -t bncr .
    docker run --rm -it -v "$(pwd)/config.toml:/usr/src/app/config.toml:ro" bncr
