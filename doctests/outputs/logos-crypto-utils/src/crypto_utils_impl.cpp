#include "crypto_utils_impl.h"

CryptoUtilsImpl::CryptoUtilsImpl() {}
CryptoUtilsImpl::~CryptoUtilsImpl() {}

std::string CryptoUtilsImpl::echo(const std::string& input) {
    return "echo: " + input;
}
