defmodule CallsafeSignalingTest do
  use ExUnit.Case
  doctest CallsafeSignaling

  test "greets the world" do
    assert CallsafeSignaling.hello() == :world
  end
end
