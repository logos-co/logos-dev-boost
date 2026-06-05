#include "crypto_utils_impl.h"

CryptoUtilsImpl::CryptoUtilsImpl() {}
CryptoUtilsImpl::~CryptoUtilsImpl() {}

int64_t CryptoUtilsImpl::checksum(const std::string& text) {
    return static_cast<int64_t>(::cipher_checksum(text.c_str()));
}

int64_t CryptoUtilsImpl::caesar_shift(int64_t code, int64_t shift) {
    return static_cast<int64_t>(::cipher_caesar_shift(static_cast<int>(code), static_cast<int>(shift)));
}

std::string CryptoUtilsImpl::version() {
    return std::string(::cipher_version());
}
