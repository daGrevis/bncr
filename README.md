# bncr

IRC bot that manages +o & +v flags, and kicks when message matches regexp

## Usage

* Install dependencies by running `yarn`

* Create config by running `cp config.example.toml config.toml`

* Edit config

* Start bot by running `yarn start`

## Docker

    docker build -t bncr .
    docker run --rm -it -v "$(pwd)/config.toml:/usr/src/app/config.toml:ro" bncr
