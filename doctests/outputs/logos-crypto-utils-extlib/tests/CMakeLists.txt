cmake_minimum_required(VERSION 3.14)
project(CryptoUtilsTests LANGUAGES C CXX)

include(LogosTest)

logos_test(
    NAME crypto_utils_tests
    MODULE_SOURCES ../src/crypto_utils_impl.cpp
        ../lib/libcipher.c
    TEST_SOURCES
        main.cpp
        test_crypto_utils.cpp
    EXTRA_INCLUDES
        ${CMAKE_CURRENT_SOURCE_DIR}/../lib
)
