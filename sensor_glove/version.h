// version.h – firmware version, printed at start and with "i"
//
// The test tool (repo tools) reads the line "Firmware: glove 2.2, protocol 2, build ..."
// and warns when a board runs older firmware than it expects. Raise
// FIRMWARE_VERSION when commands or printed lines change; PROTOCOL_VERSION only
// when the radio messages change (repo "protocol"), together with the robot hand.
#pragma once

#define FIRMWARE_VERSION "2.2"
#define PROTOCOL_VERSION "2"  // 1 = JSON, 2 = binary (one uint8 per finger)

// The build on GitHub (.github/workflows/firmware.yml) writes build_info.h with
// the commit, so a flashed board says exactly which build it runs.
#if __has_include("build_info.h")
#include "build_info.h"
#endif
#ifndef FIRMWARE_BUILD
#define FIRMWARE_BUILD "local"
#endif

// Also searched for in the .bin file by the test tool's "Flash firmware" dialog.
constexpr const char FIRMWARE_INFO[] =
    "Firmware: glove " FIRMWARE_VERSION ", protocol " PROTOCOL_VERSION ", build " FIRMWARE_BUILD;
