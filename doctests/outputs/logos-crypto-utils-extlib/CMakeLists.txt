cmake_minimum_required(VERSION 3.14)
project(LogosCryptoUtilsPlugin LANGUAGES C CXX)

if(DEFINED ENV{LOGOS_MODULE_BUILDER_ROOT})
    include($ENV{LOGOS_MODULE_BUILDER_ROOT}/cmake/LogosModule.cmake)
else()
    message(FATAL_ERROR "LogosModule.cmake not found. Set LOGOS_MODULE_BUILDER_ROOT.")
endif()

configure_file(${CMAKE_CURRENT_SOURCE_DIR}/metadata.json ${CMAKE_CURRENT_BINARY_DIR}/metadata.json COPYONLY)

logos_module(
    NAME crypto_utils
    SOURCES
        src/crypto_utils_impl.h
        src/crypto_utils_impl.cpp
        generated_code/crypto_utils_qt_glue.h
        generated_code/crypto_utils_dispatch.cpp
        lib/libcipher.c
    INCLUDE_DIRS
        ${CMAKE_CURRENT_SOURCE_DIR}/generated_code
        ${CMAKE_CURRENT_SOURCE_DIR}/lib
)
