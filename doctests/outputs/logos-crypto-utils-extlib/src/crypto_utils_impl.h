#pragma once
#include <string>
#include <vector>
#include <cstdint>

extern "C" {
    #include "lib/libcipher.h"
}

class CryptoUtilsImpl {
public:
    CryptoUtilsImpl();
    ~CryptoUtilsImpl();

    int64_t checksum(const std::string& text);
    int64_t caesar_shift(int64_t code, int64_t shift);
    std::string version();

private:
    // Private members
};
