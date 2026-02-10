defmodule CallsafeSignaling.Protocol.MessageTypesTest do
  use ExUnit.Case, async: true

  alias CallsafeSignaling.Protocol.MessageTypes

  describe "version/0" do
    test "returns protocol version" do
      assert MessageTypes.version() == "1.0.0"
    end
  end

  describe "message type constants" do
    test "returns correct message type strings" do
      assert MessageTypes.call_initiate() == "call:initiate"
      assert MessageTypes.call_accept() == "call:accept"
      assert MessageTypes.webrtc_offer() == "webrtc:offer"
      assert MessageTypes.device_connect() == "device:connect"
      assert MessageTypes.media_toggle() == "media:toggle"
    end
  end

  describe "all/0" do
    test "returns all 30 message types" do
      all_types = MessageTypes.all()
      assert length(all_types) == 30
      assert "call:initiate" in all_types
      assert "server:shutdown" in all_types
    end
  end

  describe "valid?/1" do
    test "returns true for valid message types" do
      assert MessageTypes.valid?("call:initiate")
      assert MessageTypes.valid?("webrtc:offer")
      assert MessageTypes.valid?("media:toggle")
    end

    test "returns false for invalid message types" do
      refute MessageTypes.valid?("invalid:type")
      refute MessageTypes.valid?("call:unknown")
      refute MessageTypes.valid?("")
    end
  end
end
