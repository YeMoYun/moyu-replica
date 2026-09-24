cmake_minimum_required(VERSION 3.19 FATAL_ERROR)
project(all)

add_subdirectory(QtScrcpy)

option(MOYU_BUILD_TESTS "Build MoYuMaster native UI tests" OFF)
if(MOYU_BUILD_TESTS)
    enable_testing()
    add_subdirectory(QtScrcpy/tests)
endif()
